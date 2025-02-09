const express = require('express');
const router = express.Router();
const pool = require('../../../database/sqlConnection');
const getRandomApiKey = require('../deploymentApis/getRandomApiKey')
const axios = require('axios'); 

router.get('/api/check-app-name', async (req, res) => {
    try {
        const { name } = req.query;

        // Basic validation
        if (!name || name.length < 3 || name.length > 30 || !/^[a-z0-9-]+$/.test(name)) {
            return res.json({
                exists: false,
                reserved: false,
                herokuExists: false,
                error: 'Invalid name format'
            });
        }

        // Check if app exists in your database
        const [rows] = await pool.query(
            'SELECT id FROM deployed_apps WHERE app_name = ?',
            [name]
        );

        // Check if name is reserved
        const reservedNames = [
            'heroku-td', 'admin-td', 'api-td', 'dashboard-td', 'app-td', 'staging-td', 'production-td',
            'test-td', 'testing-td', 'www-td', 'web-td', 'mail-td', 'email-td', 'beta-td', 'demo-td'
        ];

        const exists = rows.length > 0;
        const reserved = reservedNames.includes(name);

        // Check Heroku app availability
        let herokuExists = false;
        const apiKey = await getRandomApiKey(); // Use your existing function to get a Heroku API key

        if (apiKey) {
            try {
                // Fetch all Heroku apps to check name availability
                const herokuAppsResponse = await axios.get('https://api.heroku.com/apps', {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Accept': 'application/vnd.heroku+json; version=3'
                    },
                    params: {
                        app_name: name // This filters apps by the specific name
                    }
                });
                
                // If the response has data, the app name is taken
                herokuExists = herokuAppsResponse.data.length > 0;
            } catch (herokuError) {
                console.error('Heroku API check error:', herokuError);
                // If there's an error, assume the name might be available
                herokuExists = false;
            }
        }

        res.json({
            exists,
            reserved,
            herokuExists,
            error: null
        });

    } catch (error) {
        console.error('Error checking app name:', error);
        res.status(500).json({
            error: 'Internal server error',
            exists: false,
            reserved: false,
            herokuExists: false
        });
    }
});

module.exports = router;