const express = require('express');
const router = express.Router();
const pool = require('../../../database/sqlConnection');
const isLoggedIn = require('../../../middlewares/isLoggedin');

// Modified bot request submission endpoint
router.post('/bot-request', isLoggedIn, async (req, res) => {
    const { name, repoUrl, envVars, deploymentCost, websiteUrl } = req.body;
    const userEmail = req.session.user.email; 
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Insert bot request with website URL
        const [result] = await connection.query(
            'INSERT INTO bot_requests (name, repo_url, dev_email, deployment_cost, website_url, status) VALUES (?, ?, ?, ?, ?, ?)',
            [name, repoUrl, userEmail, deploymentCost, websiteUrl, 'pending']
        );
        const requestId = result.insertId;

        // Insert environment variables
        if (envVars && envVars.length > 0) {
            const envVarValues = envVars.map(envVar => [
                requestId, envVar.name, envVar.description
            ]);
            await connection.query(
                'INSERT INTO bot_request_env_vars (request_id, var_name, var_description) VALUES ?',
                [envVarValues]
            );
        }

        await connection.commit();
        res.json({
            success: true,
            message: 'Bot request submitted successfully',
            requestId
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error submitting bot request:', error);
        res.status(500).json({ error: 'An error occurred while submitting the bot request' });
    } finally {
        connection.release();
    }
});

// Get user's bot requests
// Get user's bot requests
router.get('/my-bot-requests', isLoggedIn, async (req, res) => {
    try {
        const [requests] = await pool.query(`
            SELECT br.*, 
                GROUP_CONCAT(DISTINCT CONCAT(bre.var_name, ':', bre.var_description) SEPARATOR '||') as env_vars
            FROM bot_requests br
            LEFT JOIN bot_request_env_vars bre ON br.id = bre.request_id
            WHERE br.dev_email = ?
            GROUP BY br.id
            ORDER BY br.created_at DESC
        `, [req.session.user.email]);

        const formattedRequests = requests.map(request => ({
            ...request,
            env_vars: request.env_vars ? request.env_vars.split('||').map(env => {
                const [name, description] = env.split(':');
                return { name, description };
            }) : []
        }));

        res.json(formattedRequests);
    } catch (error) {
        console.error('Error fetching bot requests:', error);
        res.status(500).json({ error: 'An error occurred while fetching bot requests' });
    }
});

router.get('/my-bots', isLoggedIn, async (req, res) => {
    console.log('User session:', req.session.user);  // Debug the session
    
    if (!req.session.user || !req.session.user.email) {
        return res.status(401).json({ error: 'User not logged in' });
    }
    
    try {
        // First, fetch existing bots
        const [existingBots] = await pool.query(`
            SELECT 
                b.id,
                b.name,
                b.repo_url,
                b.website_url,
                b.status,
                b.deployment_cost,
                b.created_at,
                bcr.id as change_request_id,
                bcr.name as pending_name,
                bcr.repo_url as pending_repo_url,
                bcr.website_url as pending_website_url,
                bcr.status as change_request_status,
                GROUP_CONCAT(DISTINCT CONCAT(be.var_name, ':', be.var_description) SEPARATOR '||') as env_vars,
                GROUP_CONCAT(DISTINCT CONCAT(bcre.var_name, ':', bcre.var_description) SEPARATOR '||') as pending_env_vars
            FROM bots b
            LEFT JOIN bot_change_requests bcr ON b.id = bcr.bot_id AND bcr.status = 'pending'
            LEFT JOIN bot_env_vars be ON b.id = be.bot_id
            LEFT JOIN bot_change_request_env_vars bcre ON bcr.id = bcre.change_request_id
            WHERE b.dev_email = ?
            GROUP BY b.id, bcr.id
        `, [req.session.user.email]);

        // Updated query to include more bot request statuses
        const [pendingBotRequests] = await pool.query(`
            SELECT 
                br.id,
                br.name,
                br.repo_url AS repo_url,
                br.website_url,
                br.status,
                br.deployment_cost,
                br.created_at,
                GROUP_CONCAT(DISTINCT CONCAT(bre.var_name, ':', bre.var_description) SEPARATOR '||') as env_vars
            FROM bot_requests br
            LEFT JOIN bot_request_env_vars bre ON br.id = bre.request_id
            WHERE br.dev_email = ? 
            AND br.status IN ('pending', 'approved', 'suspended', 'rejected')
            GROUP BY br.id
        `, [req.session.user.email]);

        console.log('Existing Bots Count:', existingBots.length);
        console.log('Pending Bot Requests Count:', pendingBotRequests.length);

        // Format existing bots
        const formattedBots = existingBots.map(bot => ({
            id: bot.id,
            name: bot.name,
            repo_url: bot.repo_url,
            website_url: bot.website_url,
            status: bot.status,
            deployment_cost: bot.deployment_cost,
            created_at: bot.created_at,
            env_vars: bot.env_vars ? bot.env_vars.split('||').map(env => {
                const [name, description] = env.split(':');
                return { name, description };
            }) : [],
            pending_changes: bot.change_request_id ? {
                id: bot.change_request_id,
                name: bot.pending_name,
                repo_url: bot.pending_repo_url,
                website_url: bot.pending_website_url,
                env_vars: bot.pending_env_vars ? bot.pending_env_vars.split('||').map(env => {
                    const [name, description] = env.split(':');
                    return { name, description };
                }) : []
            } : null,
            type: 'existing_bot'
        }));

        // Format pending bot requests
        const formattedPendingBots = pendingBotRequests.map(request => ({
            id: request.id,
            name: request.name,
            repo_url: request.repo_url,
            website_url: request.website_url,
            status: request.status,
            deployment_cost: request.deployment_cost,
            created_at: request.created_at,
            env_vars: request.env_vars ? request.env_vars.split('||').map(env => {
                const [name, description] = env.split(':');
                return { name, description };
            }) : [],
            pending_changes: null,
            type: 'bot_request'
        }));

        // Combine and return both existing bots and pending bot requests
        const combinedBots = [...formattedBots, ...formattedPendingBots];

        console.log('Combined Bots Total:', combinedBots.length);
        console.log('Combined Bots Statuses:', combinedBots.map(bot => bot.status));

        res.json(combinedBots);
    } catch (error) {
        console.error('Detailed error fetching bots:', error);
        res.status(500).json({ 
            error: 'An error occurred while fetching bots', 
            details: error.message 
        });
    }
});
// Update bot (for approved bots)
// Update bot (for approved bots)
router.put('/bot/:id', isLoggedIn, async (req, res) => {
    const { id } = req.params;
    const { name, repoUrl, websiteUrl, envVars } = req.body;
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
    
        // Verify ownership
        const [bot] = await connection.query(
            'SELECT * FROM bots WHERE id = ? AND dev_email = ?',
            [id, req.session.user.email]
        );
    
        if (!bot.length) {
            return res.status(404).json({ error: 'Bot not found or unauthorized' });
        }
    
        // Update bot
        await connection.query(
            'UPDATE bots SET name = ?, repo_url = ?, website_url = ? WHERE id = ?',
            [name, repoUrl, websiteUrl, id]
        );
    
        // Update env vars
        await connection.query('DELETE FROM bot_env_vars WHERE bot_id = ?', [id]);
        if (envVars && envVars.length > 0) {
            const envVarValues = envVars.map(envVar => [
                id, envVar.name, envVar.description
            ]);
            await connection.query(
                'INSERT INTO bot_env_vars (bot_id, var_name, var_description) VALUES ?',
                [envVarValues]
            );
        }
    
        await connection.commit();
        res.json({ success: true, message: 'Bot updated successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error updating bot:', error);
        res.status(500).json({ error: 'An error occurred while updating the bot' });
    } finally {
        connection.release();
    }
});

router.delete('/bots/:id', isLoggedIn, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
    
        let botId = null;
    
        // Check in 'bots' table
        const [botResult] = await connection.query(
            'SELECT id, dev_email FROM bots WHERE id = ? AND dev_email = ?',
            [req.params.id, req.session.user.email]
        );
    
        if (botResult.length > 0) {
            botId = botResult[0].id;
    
            // Delete related records for 'bots' table
            await connection.query('DELETE FROM bot_env_vars WHERE bot_id = ?', [botId]);
            await connection.query('DELETE FROM deployed_apps WHERE bot_id = ?', [botId]);
            await connection.query('DELETE FROM bot_change_requests WHERE bot_id = ?', [botId]);
            await connection.query('DELETE FROM bots WHERE id = ?', [botId]);
        } else {
            // Check in 'bot_requests' table
            const [botRequestResult] = await connection.query(
                'SELECT id FROM bot_requests WHERE id = ? AND dev_email = ?',
                [req.params.id, req.session.user.email]
            );
    
            if (botRequestResult.length > 0) {
                botId = botRequestResult[0].id;
    
                // Delete related records for 'bot_requests' table
                await connection.query('DELETE FROM bot_request_env_vars WHERE request_id = ?', [botId]);
                await connection.query('DELETE FROM bot_requests WHERE id = ?', [botId]);
            }
        }
    
        if (!botId) {
            console.error('Not found');
            await connection.rollback();
            return res.status(404).json({ error: 'Bot or bot request not found or unauthorized' });
        }
    
        await connection.commit();
        res.json({ success: true, message: 'Bot or bot request deleted successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error deleting bot or bot request:', error);
        res.status(500).json({
            error: 'An error occurred while deleting the bot or bot request',
            details: error.message
        });
    } finally {
        connection.release();
    }
});
    

router.get('/bot-request/:id', isLoggedIn, async (req, res) => {
    try {
        const [request] = await pool.query(`
            SELECT br.*, 
                GROUP_CONCAT(DISTINCT CONCAT(bre.var_name, ':', bre.var_description) SEPARATOR '||') as env_vars
            FROM bot_requests br
            LEFT JOIN bot_request_env_vars bre ON br.id = bre.request_id
            WHERE br.id = ? AND br.dev_email = ?
            GROUP BY br.id
        `, [req.params.id, req.session.user.email]);

        if (!request[0]) {
            return res.status(404).json({ error: 'Bot request not found' });
        }

        const formattedRequest = {
            ...request[0],
            env_vars: request[0].env_vars ? request[0].env_vars.split('||').map(env => {
                const [name, description] = env.split(':');
                return { name, description };
            }) : []
        };

        res.json(formattedRequest);
    } catch (error) {
        console.error('Error fetching bot request:', error);
        res.status(500).json({ error: 'An error occurred while fetching the bot request' });
    }
});
// Delete endpoint
// router.delete('/bot-request/:id', isLoggedIn, async (req, res) => {
//     const connection = await pool.getConnection();

//     try {
//         await connection.beginTransaction();

//         // Verify the bot belongs to the user
//         const [request] = await connection.query(
//             'SELECT * FROM bot_requests WHERE id = ? AND dev_email = ?',
//             [req.params.id, req.session.user.email]
//         );

//         if (!request.length) {
//             return res.status(404).json({ error: 'Bot request not found or unauthorized' });
//         }

//         // Delete related records first
//         await connection.query('DELETE FROM bot_request_env_vars WHERE request_id = ?', [req.params.id]);

//         // Delete the main request
//         await connection.query('DELETE FROM bot_requests WHERE id = ?', [req.params.id]);

//         await connection.commit();
//         res.json({ success: true, message: 'Bot request deleted successfully' });
//     } catch (error) {
//         await connection.rollback();
//         console.error('Error deleting bot request:', error);
//         res.status(500).json({ error: 'An error occurred while deleting the bot request' });
//     } finally {
//         connection.release();
//     }
// });

// Update bot request
// Update bot request
router.put('/bot-request/:id', isLoggedIn, async (req, res) => {
    const { id } = req.params;
    const { name, repoUrl, deploymentCost, websiteUrl, envVars } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Update main request
        await connection.query(
            'UPDATE bot_requests SET name = ?, repo_url = ?, deployment_cost = ?, website_url = ? WHERE id = ? AND dev_email = ?',
            [name, repoUrl, deploymentCost, websiteUrl, id, req.session.user.email]
        );

        // Update env vars
        await connection.query('DELETE FROM bot_request_env_vars WHERE request_id = ?', [id]);
        if (envVars && envVars.length > 0) {
            const envVarValues = envVars.map(envVar => [
                id, envVar.name, envVar.description
            ]);
            await connection.query(
                'INSERT INTO bot_request_env_vars (request_id, var_name, var_description) VALUES ?',
                [envVarValues]
            );
        }

        await connection.commit();
        res.json({ success: true, message: 'Bot request updated successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error updating bot request:', error);
        res.status(500).json({ error: 'An error occurred while updating the bot request' });
    } finally {
        connection.release();
    }
});


// User route to submit bot change request
router.post('/bot/:id/change-request', isLoggedIn, async (req, res) => {
    const { id } = req.params;
    const { name, repoUrl, websiteUrl, envVars } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // First, get the current bot details
        const [currentBot] = await connection.query(
            'SELECT * FROM bots WHERE id = ?', 
            [id]
        );

        if (!currentBot.length) {
            await connection.rollback();
            return res.status(404).json({ error: 'Bot not found' });
        }

        // Create change request
        const [changeRequestResult] = await connection.query(
            'INSERT INTO bot_change_requests (bot_id, name, repo_url, website_url, dev_email, status) VALUES (?, ?, ?, ?, ?, ?)',
            [
                id, 
                name || currentBot[0].name, 
                repoUrl || currentBot[0].repo_url, 
                websiteUrl || currentBot[0].website_url, 
                currentBot[0].dev_email, 
                'pending'
            ]
        );
        const changeRequestId = changeRequestResult.insertId;

        // Insert environment variables for the change request
        if (envVars && envVars.length > 0) {
            const envVarValues = envVars.map(env => [
                changeRequestId, 
                env.name, 
                env.description
            ]);

            await connection.query(
                'INSERT INTO bot_change_request_env_vars (change_request_id, var_name, var_description) VALUES ?',
                [envVarValues]
            );
        }

        await connection.commit();
        res.json({ 
            success: true, 
            message: 'Bot change request submitted successfully',
            changeRequestId 
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error creating bot change request:', error);
        res.status(500).json({ error: 'An error occurred while submitting the change request' });
    } finally {
        connection.release();
    }
});


// Bot change request management
// router.post('/bot-change-request/:botId', isLoggedIn, async (req, res) => {
//     const { botId } = req.params;
//     const { name, repoUrl, websiteUrl, envVars } = req.body;
//     const connection = await pool.getConnection();
    
//     try {
//         await connection.beginTransaction();
    
//         // Verify bot ownership
//         const [bot] = await connection.query(
//             'SELECT * FROM bots WHERE id = ? AND dev_email = ?',
//             [botId, req.session.user.email]
//         );
    
//         if (!bot.length) {
//             return res.status(404).json({ error: 'Bot not found or unauthorized' });
//         }
    
//         // Create change request
//         const [result] = await connection.query(
//             `INSERT INTO bot_change_requests 
//             (bot_id, name, repo_url, website_url, dev_email, status) 
//             VALUES (?, ?, ?, ?, ?, 'pending')`,
//             [botId, name, repoUrl, websiteUrl, req.session.user.email]
//         );
    
//         const changeRequestId = result.insertId;
    
//         // Insert environment variables for the change request
//         for (const envVar of envVars) {
//             await connection.query(
//                 `INSERT INTO bot_change_request_env_vars 
//                 (change_request_id, var_name, var_description) 
//                 VALUES (?, ?, ?)`,
//                 [changeRequestId, envVar.name, envVar.description]
//             );
//         }
    
//         await connection.commit();
//         res.json({
//             success: true,
//             message: 'Bot change request submitted successfully',
//             changeRequestId
//         });
//     } catch (error) {
//         await connection.rollback();
//         console.error('Error submitting bot change request:', error);
//         res.status(500).json({ error: 'An error occurred while submitting the change request' });
//     } finally {
//         connection.release();
//     }
//     });
    
// Get all change requests for a bot
router.get('/bot-change-requests/:botId', isLoggedIn, async (req, res) => {
    try {
        const [requests] = await pool.query(`
            SELECT bcr.*, 
                GROUP_CONCAT(DISTINCT CONCAT(bcre.var_name, ':', bcre.var_description) SEPARATOR '||') as env_vars
            FROM bot_change_requests bcr
            LEFT JOIN bot_change_request_env_vars bcre ON bcr.id = bcre.change_request_id
            WHERE bcr.bot_id = ? AND bcr.dev_email = ?
            GROUP BY bcr.id
            ORDER BY bcr.created_at DESC
        `, [req.params.botId, req.session.user.email]);

        const formattedRequests = requests.map(request => ({
            ...request,
            env_vars: request.env_vars ? request.env_vars.split('||').map(env => {
                const [name, description] = env.split(':');
                return { name, description };
            }) : []
        }));

        res.json(formattedRequests);
    } catch (error) {
        console.error('Error fetching change requests:', error);
        res.status(500).json({ error: 'An error occurred while fetching change requests' });
    }
});
module.exports = router;