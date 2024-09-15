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
app.post('/api/signin', (req, res) => {
  const receivedData = req.body;
  console.log('Data received:', receivedData);
  res.json({
    message: "Data for signin received successfully!",
    receivedData: receivedData
  });
});

// POST listener: signup
app.post('/api/signup', async (req, res) => {
  const {signupEmail, signupName, signupPassword, signupStudentnum} = req.body;

  try {
    // Check first if the student is already in the database
    if (await verifyUser(signupEmail, false)) {
      res.json({
        message: "Failed Signup: Student email is already registered!",
      });

      return;
    }

    const hashedPassword = await bcrypt.hash(signupPassword, 10);

    res.json({
      message: "Huh?",
    });
  } catch (err) {
    console.error("Error during signup process", err);
    throw err;
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

/* Function to make request to DB checking if the user exists or not
(used in both sign-in and sign-up process) */
async function verifyUser(email, is_staff) {
  let connection;
  try {
    // Establish the database connection first
    connection = await mysql.connectDatabase();

    // Check if the email already exists
    const checkUserQuery = `SELECT * FROM ${is_staff ? "Staff" : "Students"} WHERE email = ?`;
    const [results] = await connection.execute(checkUserQuery, [email]);

    // Return true/false whether the user exists or not
    return results.length > 0;
  } catch (err) {
    console.error('Error during verifying user in database:', err);
    throw err;
  } finally {
    if (connection) {
      await mysql.disconnectDatabase(connection);
    }
  }
}