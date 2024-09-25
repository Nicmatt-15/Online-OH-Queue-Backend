/* Import Statements */
const express = require('express');
const cors = require('cors');
const mysql = require('./connectDatabase');
const bcrypt = require('bcrypt');

/* Server setup for API listener */
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON data
app.use(express.json());

// Allow CORS
app.use(cors());

// Basic route to check if the server is running
app.get('/', (req, res) => {
  res.send('Hello from the server!');
});

// GET listener
app.get('/api/data', (req, res) => {
  const data = {
    message: "Hello, this is the GET response!",
    status: "success",
    time: new Date().toLocaleTimeString()
  };
  res.json(data);
});

// POST listener: signin
app.post('/api/signin', async (req, res) => {
  const {loginEmail, loginPassword, loginStaff} = req.body;

  try {
    // Check first if the user is already in the database
    const userAlreadyExist = await verifyUser(loginEmail, loginStaff);
    if (!userAlreadyExist.userExists) {
      res.status(404).json({
        message: "Failed Sign-in: No user is registered!",
      });

      return;
    }

    const hashedPassword = userAlreadyExist.userInfo[0].password;
    const isMatch = await bcrypt.compare(loginPassword, hashedPassword);

    if (isMatch) {
      res.status(200).json({
        message: "Sign-in successful!",
      });
    } else {
      res.status(401).json({
        success: false,
        message: "Failed Sign-in: Incorrect password!",
        errorCode: "INCORRECT_PASSWORD"
      });
    }
  } catch (err) {
    console.error("Error during signin process", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      errorCode: "SERVER_ERROR"
    });
    throw err;
  }
});

// POST listener: signup
app.post('/api/signup', async (req, res) => {
  const {signupEmail, signupName, signupPassword, signupStudentnum} = req.body;

  try {
    // Check first if the student is already in the database
    const studentAlreadyExist = await verifyUser(signupEmail, false);
    if (studentAlreadyExist.userExists) {
      res.status(409).json({
        success: false,
        message: "Failed Signup: Student email is already registered!",
        errorCode: "EMAIL_ALREADY_REGISTERED"
      });

      return;
    }

    // If the student is not already in the database, add the student into
    // the database
    const hashedPassword = await bcrypt.hash(signupPassword, 10);

    if (await addStudent(signupStudentnum, signupName, signupEmail, hashedPassword)) {
      res.status(200).json({
        message: "User signup is successful!",
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Failed user signup due to a server error",
        errorCode: "DATABASE_INSERT_FAILED"
      });
    }
  } catch (err) {
    console.error("Error during signup process", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      errorCode: "SERVER_ERROR"
    });
    throw err;
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

/* Function to make request to DB checking if the user exists or not
(used in both sign-in and sign-up process) */
async function verifyUser(email, isStaff) {
  let connection;
  try {
    // Establish the database connection first
    connection = await mysql.connectDatabase();

    // Check if the email already exists
    const checkUserQuery = `SELECT * FROM ${isStaff ? "Staff" : "Students"} WHERE email = ?`;
    const [results] = await connection.execute(checkUserQuery, [email]);

    // Return true/false whether the user exists or not and the query result itself
    return {
      userExists: results.length > 0,
      userInfo: results
    };
  } catch (err) {
    console.error('Error during verifying user in database:', err);
    throw err;
  } finally {
    if (connection) {
      await mysql.disconnectDatabase(connection);
    }
  }
}

async function addStudent(studentnum, name, email, password) {
  let connection;
  try {
    // Establish the database connection first
    connection = await mysql.connectDatabase();

    // Send the request
    const insertStudentQuery = `INSERT INTO Students (student_number, name, email, password) VALUES (?, ?, ?, ?)`;
    const [results] = await connection.execute(insertStudentQuery, [studentnum, name, email, password]);

    // Return true/false whether the affected row is 1 or not
    return results.affectedRows == 1;
  } catch (err) {
    console.error('Error during adding student into database:', err);
    throw err;
  } finally {
    if (connection) {
      await mysql.disconnectDatabase(connection);
    }
  }
}

// POST Listener: Join Queue
app.post('/api/joinqueue', async (req, res) => {
  const {userEmail, studentQuestion} = req.body;

  try {
    const addToQueueResult = await addToQueue(userEmail, studentQuestion);

    if (addToQueueResult) {
      res.status(200).json(
        {message: "Join Successful: You've been added into the queue!"}
      );
    } else {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        errorCode: "SERVER_ERROR"
      });
    }
    console.log("HIYA"); // TODO
  } catch (error) {
    console.error("Error during office hour joining process", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      errorCode: "SERVER_ERROR"
    });
    throw err;
  }
});

async function addToQueue(studentEmail, studentQuestion) {
  let connection;
  try {
    // Establish the database connection first
    connection = await mysql.connectDatabase();

    // Get the student number using the verify user method
    const userInfo = await verifyUser(studentEmail, false);
    const studentNumber = userInfo.userInfo[0].student_number;

    // From the database, get the highest queue number atm
    const findHighestQueueNumQuery = "SELECT MAX(queue_number) AS highest_queue_number FROM Queue;";
    const [findHighestQueueNumResult] = await connection.execute(findHighestQueueNumQuery);

    const highestQueueNumber = findHighestQueueNumResult[0]?.highest_queue_number || 0;
    console.log("Highest Queue Number:", highestQueueNumber);

    // Send the data to the database
    const insertQueueQuery = "INSERT INTO Queue (queue_number, student_number, question, request_time) VALUES (?, ?, ?, NOW())";
    const [insertQueueResult] = await connection.execute(insertQueueQuery, [highestQueueNumber + 1, studentNumber, studentQuestion]);

    return insertQueueResult.affectedRows == 1;
  } catch (err) {
    console.error('Error during adding student into OH queue:', err);
    throw err;
  } finally {
    if (connection) {
      await mysql.disconnectDatabase(connection);
    }
  }
}