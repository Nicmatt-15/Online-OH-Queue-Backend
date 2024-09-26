/* Import Statements */
const mysql = require('./connectDatabase');
const bcrypt = require('bcrypt');


/* Creating main method only to have an async function wrapping
the await function
 */
async function main() {
    // Establish database connection first
    const connection = await mysql.connectDatabase();
    const passwordToInsert = await bcrypt.hash("12345", 10);
    const insertStatement = `INSERT INTO Staff (staff_number, name, email, password) VALUES (?, ?, ?, ?)`;

    const [result] = await connection.execute(insertStatement, [1, "nicmatt", "nicmatt@uw.edu", passwordToInsert]);

    console.log(result);
}

main();