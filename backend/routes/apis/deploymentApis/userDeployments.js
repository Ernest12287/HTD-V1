const pool = require('../../../database/sqlConnection');

// Function to list user deployments
async function listUserDeployments(userId) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(
            'SELECT * FROM deployed_apps WHERE userId = ?',
            [userId]
        );
        return rows;
    } finally {
        connection.release();
    }
}

module.exports =  listUserDeployments ;
