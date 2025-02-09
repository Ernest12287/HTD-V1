
const fetch = require('node-fetch');
const pool = require('../../database/sqlConnection')

// Enhanced API key management functions
async function checkApiKeyValidity(apiKey) {
    try {
        const response = await fetch('https://api.heroku.com/account', {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/vnd.heroku+json; version=3'
            },
            timeout: 10000 // 10 second timeout
        });

        // Check for specific error status codes
        if (response.status === 401 || response.status === 403) {
            return false; // Invalid or unauthorized key
        }

        return response.ok;
    } catch (error) {
        console.error('Error checking API key:', error);
        // Don't mark as invalid for network/timeout errors
        return error.name === 'TimeoutError' ? true : false;
    }
}
async function updateApiKeyStatus(apiKey, isActive, reason) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Get current key status
        const [keyData] = await connection.query(
            'SELECT failed_attempts, last_checked FROM heroku_api_keys WHERE api_key = ? FOR UPDATE',
            [apiKey]
        );

        if (keyData.length === 0) {
            await connection.rollback();
            return;
        }

        // Only update if status actually changed or it's been over 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const lastChecked = new Date(keyData[0].last_checked);

        if (!isActive && lastChecked > fiveMinutesAgo) {
            // Double-check key validity before disabling
            const isStillValid = await checkApiKeyValidity(apiKey);
            if (isStillValid) {
                await connection.rollback();
                return;
            }
        }

        await connection.query(`
            UPDATE heroku_api_keys 
            SET 
                is_active = ?,
                last_checked = CURRENT_TIMESTAMP,
                failed_attempts = IF(? = false, failed_attempts + 1, 0),
                last_error = ?
            WHERE api_key = ?
        `, [isActive, isActive, reason || null, apiKey]);

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        console.error('Error updating API key status:', error);
    } finally {
        connection.release();
    }
}
module.exports = { checkApiKeyValidity, updateApiKeyStatus };