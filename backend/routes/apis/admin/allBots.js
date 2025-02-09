const express = require('express');
const router = express.Router();
const pool = require('../../../database/sqlConnection');
const isAdmin = require('../../../middlewares/isAdmin');

// Get all bots
router.get('/admin/bots', isAdmin, async (req, res) => {
    try {
        const [bots] = await pool.query(`
            SELECT b.*, 
                GROUP_CONCAT(DISTINCT CONCAT(be.var_name, ':', be.var_description) SEPARATOR '||') as env_vars
            FROM bots b
            LEFT JOIN bot_env_vars be ON b.id = be.bot_id
            GROUP BY b.id
            ORDER BY b.created_at DESC
        `);
    
        const formattedBots = bots.map(bot => ({
            ...bot,
            env_vars: bot.env_vars ? bot.env_vars.split('||').map(env => {
                const [name, description] = env.split(':');
                return { name, description };
            }) : []
        }));
    
        res.json(formattedBots);
    } catch (error) {
        console.error('Error fetching bots:', error);
        res.status(500).json({ error: 'An error occurred while fetching bots' });
    }
});

// Get all bot requests
router.get('/admin/bot-requests', isAdmin, async (req, res) => {
    try {
        const [requests] = await pool.query(`
            SELECT br.*, 
                GROUP_CONCAT(DISTINCT CONCAT(bre.var_name, ':', bre.var_description) SEPARATOR '||') as env_vars,
                u.name as user_name
            FROM bot_requests br
            LEFT JOIN bot_request_env_vars bre ON br.id = bre.request_id
            LEFT JOIN users u ON br.user_email = u.email
            GROUP BY br.id
            ORDER BY br.created_at DESC
        `);

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

// Handle bot request approval/rejection
router.post('/admin/bot-requests/:id/handle', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [request] = await connection.query(
            'SELECT * FROM bot_requests WHERE id = ?',
            [id]
        );

        if (request.length === 0) {
            throw new Error('Bot request not found');
        }

        if (status === 'approved') {
            const [envVars] = await connection.query(
                'SELECT * FROM bot_request_env_vars WHERE request_id = ?',
                [id]
            );

            const [result] = await connection.query(
                'INSERT INTO bots (name, repo_url, deployment_cost, dev_email, website_url) VALUES (?, ?, ?, ?, ?)',
                [
                    request[0].name,
                    request[0].repo_url,
                    request[0].deployment_cost,
                    request[0].user_email,
                    request[0].website_url
                ]
            );

            if (envVars.length > 0) {
                const envVarValues = envVars.map(envVar => [
                    result.insertId,
                    envVar.var_name,
                    envVar.var_description
                ]);

                await connection.query(
                    'INSERT INTO bot_env_vars (bot_id, var_name, var_description) VALUES ?',
                    [envVarValues]
                );
            }
        }

        await connection.query(
            'UPDATE bot_requests SET status = ? WHERE id = ?',
            [status, id]
        );

        await connection.commit();
        res.json({
            success: true,
            message: `Bot request ${status}`,
            deploymentCost: request[0].deployment_cost
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error handling bot request:', error);
        res.status(500).json({ error: 'An error occurred while handling the bot request' });
    } finally {
        connection.release();
    }
});

// Get pending change requests
router.get('/admin/bot-change-requests', isAdmin, async (req, res) => {
    try {
        const [requests] = await pool.query(`
            SELECT bcr.*, b.name as current_bot_name, 
                GROUP_CONCAT(DISTINCT CONCAT(bre.var_name, ':', bre.var_description) SEPARATOR '||') as env_vars,
                u.name as user_name
            FROM bot_change_requests bcr
            JOIN bots b ON bcr.bot_id = b.id
            LEFT JOIN bot_change_request_env_vars bre ON bcr.id = bre.change_request_id
            LEFT JOIN users u ON bcr.user_email = u.email
            WHERE bcr.status = 'pending'
            GROUP BY bcr.id
            ORDER BY bcr.created_at DESC
        `);

        const formattedRequests = requests.map(request => ({
            ...request,
            env_vars: request.env_vars ? request.env_vars.split('||').map(env => {
                const [name, description] = env.split(':');
                return { name, description };
            }) : []
        }));

        res.json(formattedRequests);
    } catch (error) {
        console.error('Error fetching bot change requests:', error);
        res.status(500).json({ error: 'An error occurred while fetching bot change requests' });
    }
});

// Approve bot changes
router.post('/admin/approve-bot-change/:id', isAdmin, async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const [changeRequest] = await connection.query(
            'SELECT * FROM bot_change_requests WHERE id = ?',
            [req.params.id]
        );
        
        if (!changeRequest.length) {
            throw new Error('Change request not found');
        }
        
        const request = changeRequest[0];
        
        await connection.query(
            'UPDATE bots SET name = ?, repo_url = ?, website_url = ? WHERE id = ?',
            [request.name, request.repo_url, request.website_url, request.bot_id]
        );
        
        const [newEnvVars] = await connection.query(
            'SELECT * FROM bot_change_request_env_vars WHERE change_request_id = ?',
            [req.params.id]
        );
        
        await connection.query('DELETE FROM bot_env_vars WHERE bot_id = ?', [request.bot_id]);
        for (const envVar of newEnvVars) {
            await connection.query(
                'INSERT INTO bot_env_vars (bot_id, var_name, var_description) VALUES (?, ?, ?)',
                [request.bot_id, envVar.var_name, envVar.var_description]
            );
        }
        
        await connection.query(
            'UPDATE bot_change_requests SET status = ? WHERE id = ?',
            ['approved', req.params.id]
        );
        
        await connection.commit();
        res.json({ success: true, message: 'Bot changes approved successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error approving bot changes:', error);
        res.status(500).json({ error: 'An error occurred while approving bot changes' });
    } finally {
        connection.release();
    }
});

// Toggle bot status
router.post('/admin/bot/:id/toggle-status', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { is_suspended } = req.body;
    
    try {
        await pool.query(
            'UPDATE bots SET is_suspended = ? WHERE id = ?',
            [is_suspended, id]
        );
    
        res.json({ 
            success: true, 
            message: `Bot ${is_suspended ? 'suspended' : 'activated'} successfully` 
        });
    } catch (error) {
        console.error('Error toggling bot status:', error);
        res.status(500).json({ error: 'An error occurred while updating bot status' });
    }
});

module.exports = router;