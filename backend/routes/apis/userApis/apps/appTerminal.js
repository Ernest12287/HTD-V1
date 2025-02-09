const express = require('express');
const axios = require('axios');
const pool = require('../../../../database/sqlConnection');
const isLoggedIn = require('../../../../middlewares/isLoggedin');

const router = express.Router();

// Execute npm commands using Heroku API (one-off dynos)
async function executeNpmCommandOnHeroku(apiKey, app, command) {
    try {
        // Create a one-off dyno to run the npm command
        const response = await axios.post(
            `https://api.heroku.com/apps/${app}/dynos`,
            {
                command, // The npm command (e.g., 'npm install')
                type: 'run', // Run type for one-off dynos
            },
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    Accept: 'application/vnd.heroku+json; version=3',
                },
            }
        );

        // Return the dyno ID to track logs
        return response.data.id;
    } catch (error) {
        console.error('Error executing npm command on Heroku:', error.response?.data || error.message);
        throw new Error('Failed to execute npm command on Heroku');
    }
}

// Route to handle npm commands
router.post('/api/npm-command', isLoggedIn, async (req, res) => {
    const { app, command } = req.body;

    try {
        // Get all active Heroku API keys from the database
        const [apiKeys] = await pool.query(
            'SELECT api_key FROM heroku_api_keys WHERE is_active = true'
        );

        if (apiKeys.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No active Heroku API key found',
            });
        }

        let dynoId = null;
        for (const apiKeyRecord of apiKeys) {
            const apiKey = apiKeyRecord.api_key;

            try {
                // Try to execute the npm command with the current API key
                dynoId = await executeNpmCommandOnHeroku(apiKey, app, command);
                // If the command succeeds, break out of the loop
                break;
            } catch (err) {
                // If the command fails, continue to the next API key
                console.error(`Error with API key ${apiKey}: ${err.message}`);
                continue;
            }
        }

        if (!dynoId) {
            return res.status(400).json({
                success: false,
                error: 'Failed to execute npm command with any active Heroku API key',
            });
        }

        res.json({
            success: true,
            message: `Command executed. See the logs for more info, here's dyno id:\n ${dynoId}`,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to execute npm command',
        });
    }
});


module.exports = router;