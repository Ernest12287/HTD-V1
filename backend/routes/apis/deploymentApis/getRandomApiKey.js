const checkHerokuAppLimit  = require('./checkHerokuAppLimit');
const pool = require('../../../database/sqlConnection')


// Function to get random API key with capacity check
async function getRandomApiKey(connection) {
const [keys] = await pool.query(`
    SELECT api_key 
    FROM heroku_api_keys 
    WHERE is_active = true 
    ORDER BY RAND()
`);

for (const keyObj of keys) {
    const apiKey = keyObj.api_key;
    const status = await checkHerokuAppLimit(apiKey);

    if (!status.isValid) {
        // Only disable the key if it's completely invalid/banned
        await pool.query(`
            UPDATE heroku_api_keys 
            SET is_active = false,
                error_message = ?,
                last_failed = CURRENT_TIMESTAMP
            WHERE api_key = ?
        `, [status.error, apiKey]);
        continue;
    }

    if (status.hasCapacity) {
        // Update the app count but keep the key active
        await pool.query(`
            UPDATE heroku_api_keys 
            SET apps_count = ?,
                last_checked = CURRENT_TIMESTAMP
            WHERE api_key = ?
        `, [status.appsCount, apiKey]);
        return apiKey;
    }
}

return null;
}
module.exports = getRandomApiKey;