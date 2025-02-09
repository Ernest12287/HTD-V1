const express = require('express');
const axios = require('axios');
const router = express.Router();
const pool = require('../../../../database/sqlConnection');
const isLoggedIn = require('../../../../middlewares/isLoggedin');

// Sensitive vars to exclude from response
const SENSITIVE_VARS = ['HEROKU_API_KEYY', 'HEROKU_APP_NAMEE'];

// Utility function to handle Heroku API requests with multiple keys
async function handleHerokuRequest(appName, updatedVars, method = 'get', varKey = null) {
    const connection = await pool.getConnection();
    try {
        const [apiKeys] = await connection.query(
            'SELECT api_key FROM heroku_api_keys WHERE is_active = true'
        );

        let result = null;
        let lastError = null;

        for (const { api_key } of apiKeys) {
            try {
                const url = method === 'delete' ? 
                    `https://api.heroku.com/apps/${appName}/config-vars` :
                    `https://api.heroku.com/apps/${appName}/config-vars`;

                const response = await axios({
                    method: method,
                    url: url,
                    data: updatedVars,
                    headers: {
                        Authorization: `Bearer ${api_key}`,
                        Accept: 'application/vnd.heroku+json; version=3',
                        'Content-Type': 'application/json',
                    },
                });

                result = response.data;
                break;
            } catch (error) {
                lastError = error;
                continue;
            }
        }

        if (!result) {
            throw lastError || new Error('Failed to process Heroku API request');
        }

        return result;
    } catch (error) {
        throw error;
    } finally {
        connection.release();
    }
}

// Get config vars
router.get('/api/config-vars/:appName', isLoggedIn, async (req, res) => {
    const appName = req.params.appName;

    try {
        const configVars = await handleHerokuRequest(appName);

        // Filter out sensitive variables
        const filteredVars = Object.fromEntries(
            Object.entries(configVars).filter(([key]) => !SENSITIVE_VARS.includes(key))
        );

        res.json(filteredVars);
    } catch (error) {
        console.error('Error fetching config vars:', error);
        res.status(500).send(`Failed to fetch config vars: ${error.message}`);
    }
});

// Update config vars
router.post('/api/config-vars/:appName', isLoggedIn, async (req, res) => {
    const appName = req.params.appName;
    const updatedVars = req.body;

    try {
        // Get current config vars first
        const currentVars = await handleHerokuRequest(appName);

        // Preserve sensitive variables
        const sensitiveVars = {};
        SENSITIVE_VARS.forEach(key => {
            if (currentVars[key]) {
                sensitiveVars[key] = currentVars[key];
            }
        });

        // Merge sensitive vars with updated vars
        const finalVars = {
            ...updatedVars,
            ...sensitiveVars
        };

        // Update with new config vars
        const response = await handleHerokuRequest(appName, finalVars, 'patch');

        // Filter out sensitive variables from response
        const filteredResponse = Object.fromEntries(
            Object.entries(response).filter(([key]) => !SENSITIVE_VARS.includes(key))
        );

        res.json(filteredResponse);
    } catch (error) {
        console.error('Error updating config vars:', error);
        res.status(500).send(`Failed to update config vars: ${error.message}`);
    }
});

// Add new config var
router.put('/api/config-vars/:appName', isLoggedIn, async (req, res) => {
    const appName = req.params.appName;
    const { key, value } = req.body;

    try {
        // Get current config vars first
        const currentVars = await handleHerokuRequest(appName);

        // Add new variable
        const updatedVars = {
            ...currentVars,
            [key]: value
        };

        // Update config vars
        const response = await handleHerokuRequest(appName, updatedVars, 'patch');

        res.json(response);
    } catch (error) {
        console.error('Error adding config var:', error);
        res.status(500).send(`Failed to add config var: ${error.message}`);
    }
});

// Delete config var
router.delete('/api/config-vars/:appName/:key', isLoggedIn, async (req, res) => {
    const appName = req.params.appName;
    const varKey = req.params.key;

    try {
        // Get current vars
        const currentVars = await handleHerokuRequest(appName);

        if (!(varKey in currentVars)) {
            return res.status(404).json({ message: `Variable ${varKey} does not exist` });
        }

        // Delete the variable by explicitly setting it to `null`
        const updatedVars = {
            [varKey]: null,
        };

        const response = await handleHerokuRequest(appName, updatedVars, 'patch');

        if (response[varKey] === undefined) {
            return res.json({
                message: `Variable ${varKey} deleted successfully`,
                remainingVars: response,
            });
        } else {
            throw new Error(`Failed to delete variable ${varKey}`);
        }
    } catch (error) {
        console.error('Error deleting config var:', error);
        res.status(500).send(`Failed to delete config var: ${error.message}`);
    }
});

module.exports = router;