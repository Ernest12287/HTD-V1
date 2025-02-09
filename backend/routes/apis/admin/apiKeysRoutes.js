const express = require('express')
const router = express.Router();
const pool = require('../../../database/sqlConnection')
const isAdmin = require('../../../middlewares/isAdmin')





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
// Get all API keys
router.get('/admin/api-keys', isAdmin, async (req, res) => {
    try {
        const [keys] = await pool.query(`
            SELECT 
                id,
                api_key,
                is_active,
                last_checked,
                failed_attempts,
                last_used,
                created_at
            FROM heroku_api_keys
            ORDER BY created_at DESC
        `);
    
        // Mask API keys for security
        const maskedKeys = keys.map(key => ({
            ...key,
            api_key: `${key.api_key.substring(0, 8)}...${key.api_key.substring(key.api_key.length - 8)}`
        }));
    
        res.json(maskedKeys);
    } catch (error) {
        console.error('Error fetching API keys:', error);
        res.status(500).json({ error: 'Failed to fetch API keys' });
    }
    });
    
    
    
    // Add new API key
    router.post('/admin/api-keys', isAdmin, async (req, res) => {
        try {
            const { apiKey } = req.body;
    
            // Validate API key
            const isValid = await checkApiKeyValidity(apiKey);
    
            if (!isValid) {
                return res.status(400).json({ error: 'Invalid API key' });
            }
    
            // Check if key already exists
            const [existing] = await pool.query(
                'SELECT id FROM heroku_api_keys WHERE api_key = ?',
                [apiKey]
            );
    
            if (existing.length > 0) {
                return res.status(400).json({ error: 'API key already exists' });
            }
    
            // Insert new key
            await pool.query(`
                INSERT INTO heroku_api_keys (api_key, is_active)
                VALUES (?, true)
            `, [apiKey]);
    
            res.json({ success: true, message: 'API key added successfully' });
        } catch (error) {
            console.error('Error adding API key:', error);
            res.status(500).json({ error: 'Failed to add API key' });
        }
    });
    
    // Update API key status
    router.put('/admin/api-keys/:id', isAdmin, async (req, res) => {
        try {
            const { id } = req.params;
            const { is_active } = req.body;
    
            await pool.query(`
                UPDATE heroku_api_keys
                SET 
                    is_active = ?,
                    last_checked = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [is_active, id]);
    
            res.json({ success: true, message: 'API key updated successfully' });
        } catch (error) {
            console.error('Error updating API key:', error);
            res.status(500).json({ error: 'Failed to update API key' });
        }
    });
    
    // Delete API key
    router.delete('/admin/api-keys/:id', isAdmin, async (req, res) => {
        try {
            const { id } = req.params;
    
            await pool.query('DELETE FROM heroku_api_keys WHERE id = ?', [id]);
    
            res.json({ success: true, message: 'API key deleted successfully' });
        } catch (error) {
            console.error('Error deleting API key:', error);
            res.status(500).json({ error: 'Failed to delete API key' });
        }
    });
    
    // Admin dashboard view
    router.get('/admin/api-keys/view', isAdmin, async (req, res) => {
        try {
            const [keys] = await pool.query(`
                SELECT 
                    id,
                    CONCAT(LEFT(api_key, 8), '...', RIGHT(api_key, 8)) as masked_key,
                    is_active,
                    last_checked,
                    failed_attempts,
                    last_used,
                    created_at
                FROM heroku_api_keys
                ORDER BY created_at DESC
            `);
    
            res.render('admin/api-keys', { keys });
        } catch (error) {
            console.error('Error loading API keys view:', error);
            res.status(500).send('Error loading API keys');
        }
    });
    module.exports = router;