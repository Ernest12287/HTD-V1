const pool = require('../database/sqlConnection')
const { performance } = require('perf_hooks');
const axios = require('axios');

async function deleteApp(appName) {
    const startTime = performance.now();
    let connection;

    try {
        connection = await pool.getConnection();

        // Fetch deployment details 
        const [deploymentResults] = await connection.query(`
            SELECT id, user_id FROM deployed_apps 
            WHERE heroku_app_name = ? OR app_name = ?
        `, [appName, appName]);

        // If no deployment found, return early
        if (deploymentResults.length === 0) {
            connection.release();
            return { success: true, message: `App ${appName} not found` };
        }

        const { id: deploymentId, user_id } = deploymentResults[0];

        // Fetch random active Heroku API keys
        const [apiKeys] = await connection.query(
            'SELECT api_key FROM heroku_api_keys WHERE is_active = true ORDER BY RAND()'
        );

        let herokuDeleted = false;
        let deletionError = null;

        // Attempt Heroku deletion with multiple API keys
        for (const { api_key } of apiKeys) {
            try {
                const response = await axios.delete(`https://api.heroku.com/apps/${appName}`, {
                    headers: {
                        'Authorization': `Bearer ${api_key}`,
                        'Accept': 'application/vnd.heroku+json; version=3'
                    },
                    timeout: 10000  // Increased timeout
                });

                if (response.status === 200 || response.status === 204) {
                    herokuDeleted = true;
                    break;
                }
            } catch (error) {
                deletionError = error;
                console.error(`Heroku deletion failed with key ${api_key.slice(0, 5)}:`, error.message);
            }
        }

        // Start transaction for database cleanup
        await connection.beginTransaction();


        // Always delete from deployed_apps to prevent orphaned records
        await connection.query('DELETE FROM deployed_apps WHERE id = ?', [deploymentId]);

        await connection.commit();
        connection.release();

        const endTime = performance.now();
        console.log(`App ${appName} deletion process completed in ${(endTime - startTime).toFixed(2)}ms`);

        return {
            success: true,
            message: herokuDeleted 
                ? `App ${appName} fully deleted` 
                : `App ${appName} deleted from database, Heroku deletion failed`,
            herokuDeleted
        };

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
                connection.release();
            } catch (rollbackError) {
                console.error('Rollback error:', rollbackError);
            }
        }

        console.error('Deletion error:', error);
        return {
            success: false,
            message: `Deletion failed: ${error.message}`
        };
    }
}

module.exports = deleteApp;