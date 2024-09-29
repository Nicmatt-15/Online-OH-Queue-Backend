/* Import Statements */
const express = require('express');
const cors = require('cors');
const mysql = require('./connectDatabase');
const bcrypt = require('bcryptjs');
const http = require('http');
const { Server } = require('socket.io'); // imports Server class
const { start } = require('repl');

/* Server setup for API listener */
const app = express();
const PORT = process.env.PORT || 3000;

/* Allow CORS - Configure it properly for Express */
const corsOptions = {
  origin: 'https://nicmatt-15.github.io', // Allow requests from your GitHub Pages site
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Specify the methods you want to allow
  allowedHeaders: ['Content-Type', 'Authorization'], // Add any headers your app requires
  credentials: true // Enable this if you need cookies/auth tokens
};

app.use(cors(corsOptions));

/* Handle Preflight (OPTIONS) Requests */
app.options('*', cors(corsOptions)); // This will respond to all preflight requests

/* Server setup for socket.io server */
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://nicmatt-15.github.io",
    methods: ["GET", "POST"]
  }
});

// Middleware to parse JSON data
app.use(express.json());

// Basic route to check if the server is running
app.get('/test', (req, res) => {
  res.send('Hello from the server!');
});

app.options('*', (req, res) => {
  res.sendStatus(200); // Always respond OK to any OPTIONS request
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

// POST listener: login
app.post('/api/login', async (req, res) => {
  const {loginEmail, loginPassword, loginStaff, loginStaffStartShiftTime, loginStaffEndShiftTime} = req.body;

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
      // Check if the user is staff or not. If the user is staff,
      // add them into the database
      const isStaff = loginStaff;
      if (isStaff) {

        // Handle inserting into staff database
        // Bug: Not using await here causes the update
        // to be running on its own. Must use await to make it
        // block and update before frontend can retrieve.
        await updateAvailableStaffDB(userAlreadyExist.userInfo[0].staff_number, loginStaffStartShiftTime, loginStaffEndShiftTime);
      }

      const user_number = isStaff ? userAlreadyExist.userInfo[0].staff_number : userAlreadyExist.userInfo[0].student_number;
      res.status(200).json({
        message: "Sign-in successful!",
        user_number: user_number
      });
    } else {
      res.status(401).json({
        success: false,
        message: "Failed Sign-in: Incorrect password!",
        errorCode: "INCORRECT_PASSWORD"
      });
    }
  } catch (error) {
    console.error("Error during login process", error);
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
  } catch (error) {
    console.error("Error during signup process", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      errorCode: "SERVER_ERROR"
    });
    throw err;
  }
});

// Start the server
server.listen(PORT, () => {
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
  } catch (error) {
    console.error('Error during verifying user in database:', error);
    throw error;
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
  } catch (error) {
    console.error('Error during adding student into database:', error);
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
      // Retrieve the updated OH queue
      const retrieveLatestQueueResult = await retrieveLatestQueue();

      res.status(200).json({
        message: "Join Successful: You've been added into the queue!",
        queue: retrieveLatestQueueResult
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Internal server error",
        errorCode: "SERVER_ERROR"
      });
    }
  } catch (error) {
    console.error("Error during office hour joining process", error);
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

    // Send the data to the database
    const insertQueueQuery = "INSERT INTO Queue (queue_number, student_number, question, request_time) VALUES (?, ?, ?, NOW())";
    const [insertQueueResult] = await connection.execute(insertQueueQuery, [highestQueueNumber + 1, studentNumber, studentQuestion]);

    return insertQueueResult.affectedRows == 1;
  } catch (error) {
    console.error('Error during adding student into OH queue:', error);
    throw err;
  } finally {
    if (connection) {
      await mysql.disconnectDatabase(connection);
    }
  }
}

async function retrieveLatestQueue() {
  let connection;
  try {
    // Establish the database connection first
    connection = await mysql.connectDatabase();

    const selectQueueQuery = "SELECT Queue.*, Students.name AS student_name FROM Queue JOIN Students ON Queue.student_number = Students.student_number WHERE Queue.queue_number > 0;";
    const [result] = await connection.execute(selectQueueQuery);

    return result;
  } catch (error) {
    console.error('Error during retrieving latest OH queue:', error);
    throw err;
  } finally {
    if (connection) {
      await mysql.disconnectDatabase(connection);
    }
  }
}

// POST Listener: Retrieve Queue
// Use POST Listener here so that in the future
// if we want to add token system for safety, it will be
// easier to integrate than using GET.
app.post('/api/getqueue', async (req, res) => {
  try {
    const retrieveLatestQueueResult = await retrieveLatestQueue();
    res.status(200).json({
      message: "Queue Retrieve Successful!",
      queue: retrieveLatestQueueResult
    });
  } catch (error) {
    console.error("Error during retrieving OH queue: ", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      errorCode: "SERVER_ERROR"
    });
    throw err;
  }
});

// POST Listener: Retrieve Available Staff
// Use POST Listener here so that in the future
// if we want to add token system for safety, it will be
// easier to integrate than using GET.
app.post('/api/getavailableta', async (req, res) => {
  try {
    const retrieveLatestAvailableTAResult = await retrieveLatestAvailableTA();
    res.status(200).json({
      message: "Available TA Retrieve Successful!",
      available_ta: retrieveLatestAvailableTAResult
    });
  } catch (error) {
    console.error("Error during retrieving Available TA: ", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      errorCode: "SERVER_ERROR"
    });
    throw err;
  }
});

async function updateAvailableStaffDB(staffNumber, startShiftTime, endShiftTime) {
  const startShiftTimeObject = new Date(startShiftTime);
  const endShiftTimeObject = new Date(endShiftTime);
  const startShiftTimeUTC = startShiftTimeObject.toISOString();
  const endShiftTimeUTC = endShiftTimeObject.toISOString();

  let formattedStartShiftTime = startShiftTimeUTC.slice(0, 19).replace('T', ' ');
  let formattedEndShiftTime = endShiftTimeUTC.slice(0, 19).replace('T', ' ');

  let connection;
  try {
    // Establish the database connection first
    connection = await mysql.connectDatabase();

    // First verify if the staff number is already in the database
    const selectStaffNumQuery = `SELECT * FROM AvailableTA WHERE staff_number = ?`;
    const [selectStaffNumResult] = await connection.execute(selectStaffNumQuery, [staffNumber]);
    let staffStatus = "Available";

    if (selectStaffNumResult.length > 0) {
      staffStatus = selectStaffNumResult[0].status;

      const deleteStaffNumQuery = `DELETE FROM AvailableTA WHERE staff_number = ?`;
      const [deleteStaffNumResult] = await connection.execute(deleteStaffNumQuery, [staffNumber]);

      if (deleteStaffNumResult.affectedRows != 1) {
        console.error('Error during attempt to delete staff from Available TA databse.');
        throw err;
      }
    }

    const insertAvailableStaffQuery = `INSERT INTO AvailableTA (staff_number, status, shift_start_time, shift_end_time) VALUES (?, ?, ?, ?)`;
    const [insertAvailableStaffResult] = await connection.execute(insertAvailableStaffQuery, [staffNumber, staffStatus, formattedStartShiftTime, formattedEndShiftTime]);

    return insertAvailableStaffResult.affectedRows == 1;
  } catch (error) {
    console.error('Error during updating Available Staff:', error);
    throw err;
  } finally {
    if (connection) {
      await mysql.disconnectDatabase(connection);
    }
  }
}

async function retrieveLatestAvailableTA() {
  let connection;
  try {
    // Establish the database connection first
    connection = await mysql.connectDatabase();

    const selectAvailableTAQuery = "SELECT AvailableTA.*, Staff.name as staff_name FROM AvailableTA JOIN Staff ON AvailableTA.staff_number = Staff.staff_number;";
    const [result] = await connection.execute(selectAvailableTAQuery);

    return result;
  } catch (error) {
    console.error('Error during retrieving latest Available TA:', error);
    throw err;
  } finally {
    if (connection) {
      await mysql.disconnectDatabase(connection);
    }
  }
}

// POST Listener: Staff Helping Student
app.post('/api/helpstudent', async (req, res) => {
  const {queueNumber, staffEmail} = req.body;

  try {
    const updateOnStudentHelpResult = await updateOnStudentHelp(queueNumber, staffEmail);
    if (updateOnStudentHelpResult.updateSuccessful) {
      // Retrieve the updated queue and available TA
      const latestQueue = await retrieveLatestQueue();
      const latestAvailableTA = await retrieveLatestAvailableTA();

      // Emit to student that they are being helped
      io.to(userSocketMap[updateOnStudentHelpResult.student_email]).emit('helpIncoming', {});

      res.status(200).json({
        message: "Queue Help Confirmation Successful!",
      });

      // Emit to other the rest of the user online about
      // the update in queue table and available ta
      io.emit('newStudentHelped', {latestQueue, latestAvailableTA});
    }
  } catch (error) {
    console.error("Error during TA helping student confirmation: ", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      errorCode: "SERVER_ERROR"
    });
    throw err;
  }
});

async function updateOnStudentHelp(queueNumber, staffEmail) {
  let connection;

  try {
    // Establish the database connection first
    connection = await mysql.connectDatabase();

    // Get the staff number related to the staff email first
    const getStaffNumberQuery = `SELECT staff_number FROM Staff WHERE email = ?`;
    const [getStaffNumberResult] = await connection.execute(getStaffNumberQuery, [staffEmail]);

    // Verify that the queue doesn't already have a TA assigned to it
    // Also get the student email here related to the queue since
    // we will use that later.
    const checkQueueStatusQuery = `SELECT student_number, assign_time FROM Queue WHERE queue_number = ?`;
    const [checkQueueStatusResult] = await connection.execute(checkQueueStatusQuery, [queueNumber]);

    if (checkQueueStatusResult[0].assign_time != null) {
      console.error(`Queue number ${queueNumber} is already being helped.`);
      throw err;
    }

    // Getting the student email with the student number from above
    const getStudentEmailQuery = `SELECT email from Students WHERE student_number = ?`;
    const [getStudentEmailResult] = await connection.execute(getStudentEmailQuery, [(checkQueueStatusResult[0].student_number)]);

    // Update the queue first
    const updateQueueQuery = `UPDATE Queue SET staff_number = ?, assign_time = NOW() WHERE queue_number = ?`;
    const [updateQueueResult] = await connection.execute(updateQueueQuery, [getStaffNumberResult[0].staff_number, queueNumber]);

    // Update the TA availability next
    const availableTAUpdateQuery = `UPDATE AvailableTA SET status = "Helping" WHERE staff_number = ?`;
    const [availableTAUpdateResult] = await connection.execute(availableTAUpdateQuery, [getStaffNumberResult[0].staff_number]);

    return {
      updateSuccessful: (updateQueueResult.affectedRows == 1 && availableTAUpdateResult.affectedRows == 1),
      student_email: (getStudentEmailResult[0].email)
    };
  } catch (error) {
    console.error('Error during comfirming TA helping student:', error);
    throw err;
  } finally {
    if (connection) {
      await mysql.disconnectDatabase(connection);
    }
  }
}

/* POST Listener: Staff Helping Student */
app.post('/api/finishhelpingstudent', async (req, res) => {
  const {queueNumber, staffEmail} = req.body;

  try {
    const updateOnFinishHelpResult = await updateOnFinishHelp(queueNumber, staffEmail);
    if (updateOnFinishHelpResult) {
      // Retrieve the updated queue and available TA
      const latestQueue = await retrieveLatestQueue();
      const latestAvailableTA = await retrieveLatestAvailableTA();

      res.status(200).json({
        message: "Queue Finish Helping Confirmation Successful!",
      });

      // Emit to other the rest of the user online about
      // the update in queue table and available ta
      io.emit('newStudentFinish', {latestQueue, latestAvailableTA});
    }
  } catch (error) {
    console.error("Error during TA finish helping student confirmation: ", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      errorCode: "SERVER_ERROR"
    });
    throw err;
  }
});

async function updateOnFinishHelp(queueNumber, staffEmail) {
  let connection;

  try {
    // Establish the database connection first
    connection = await mysql.connectDatabase();

    // Get the staff number related to the staff email first
    const getStaffNumberQuery = `SELECT staff_number FROM Staff WHERE email = ?`;
    const [getStaffNumberResult] = await connection.execute(getStaffNumberQuery, [staffEmail]);

    // We update the queue database.
    // Set the queue_number to -1 and put
    // a finish time.
    const updateQueueQuery = `UPDATE Queue SET queue_number = -1, finish_time = NOW() WHERE queue_number = ?`;
    const [updateQueueResult] = await connection.execute(updateQueueQuery, [queueNumber]);

    // We update the staff available database
    // by checking if there's any active queue with the staff number.
    // If yes, don't change the status of the TA. If not, change the
    // status of the TA to available.
    const checkActiveQueueQuery = `SELECT * FROM Queue WHERE queue_number > 0 AND staff_number = ?`;
    const [checkActiveQueueResult] = await connection.execute(checkActiveQueueQuery, [getStaffNumberResult[0].staff_number]);

    // If there's no active queue under the current TA number
    let updateAvailableStaffSuccess = true;
    if (checkActiveQueueResult.length === 0) {
      // Update the database
      const updateAvailableStaffQuery = `UPDATE AvailableTA SET status = "Available" WHERE staff_number = ?`;
      const [updateAvailableStaffResult] = await connection.execute(updateAvailableStaffQuery, [getStaffNumberResult[0].staff_number]);

      updateAvailableStaffSuccess = updateAvailableStaffResult.affectedRows == 1;
    }

    return updateQueueResult.affectedRows == 1 && updateAvailableStaffSuccess;
  } catch (error) {
    console.error('Error during TA finishing helping student:', error);
    throw err;
  } finally {
    if (connection) {
      await mysql.disconnectDatabase(connection);
    }
  }
}

/* socket.io Listener Setup Related Code */
// This maps user number to socket map
const userSocketMap = {};

io.on('connection', (socket) => {
  // Register the user ID when the frontend emits it
  socket.on('registerUser', (userId) => {
    userSocketMap[userId] = socket.id; // Map userId with socket.id
    console.log(`User registered: ${userId} with socket ID: ${socket.id}`);
  });

  // Handles when a staff logs in
  socket.on('newAvailableTA', async(user) => {
    try {
      const retrieveLatestAvailableTAResult = await retrieveLatestAvailableTA();
      io.emit('availableTAUpdated', retrieveLatestAvailableTAResult);
    } catch (error) {
      console.error('Error when updating Available TA (socket.io): ', errpr)
    }
  });

  // Handles when a student enters the queue
  socket.on('joinQueue', async (user) => {
    try {
      const latestQueue = await retrieveLatestQueue();
      io.emit('queueUpdated', latestQueue);
    } catch (error) {
      console.error('Error retrieving the latest queue (socket.ios): ', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});