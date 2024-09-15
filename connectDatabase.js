const mysql = require('mysql2/promise');

let connection;

// Function to connect to the database
async function connectDatabase() {
  try {
    connection = await mysql.createConnection({
      host: 'ohproject.cxqocyuiw0eu.us-east-2.rds.amazonaws.com',
      user: 'Nicmatt',
      password: 'Ketchuplover123!',
      database: 'ohproject',
    });

    console.log('Connected to MySQL RDS database!');
    return connection;
  } catch (err) {
    console.error('Error connecting to the database:', err.stack);
    throw err;
  }
}

// Function to terminate the database connection
async function disconnectDatabase(connection) {
    if (connection) {
      try {
        await connection.end();
        console.log('Database connection terminated.');
      } catch (err) {
        console.error('Error terminating the database connection:', err.stack);
        throw err;
      }
    } else {
      console.log('No active database connection to terminate.');
    }
  }

module.exports = {
  connectDatabase,
  disconnectDatabase
};
