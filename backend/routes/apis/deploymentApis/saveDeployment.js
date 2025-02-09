const pool = require('../../../database/sqlConnection');

// Simplified function to save deployment
async function saveDeployment(userId, botId, appName, envValues) {
    const connection = await pool.getConnection();
    let deployResult;
    try {
        await connection.beginTransaction();
        
        // Insert deployment with initial active status
        [deployResult] = await connection.query(
            'INSERT INTO deployed_apps (user_id, bot_id, app_name, heroku_app_name, status) VALUES (?, ?, ?, ?, ?)',
            [userId, botId, appName, appName, 'active']
        );

        await connection.commit();
        return deployResult.insertId;
    } catch (error) {
        await connection.rollback();
        // Update status to failed if error occurs
        if (deployResult?.insertId) {
            try {
                await connection.query(
                    'UPDATE deployed_apps SET status = ? WHERE id = ?',
                    ['failed', deployResult.insertId]
                );
            } catch (updateError) {
                console.error('Failed to update deployment status to failed:', updateError);
            }
        }
        console.error('Error during saveDeployment:', error);
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = saveDeployment;