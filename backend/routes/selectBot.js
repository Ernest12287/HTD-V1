const express = require('express');
const router = express.Router();
const isLoggedIn = require('../middlewares/isLoggedin');
const pool = require('../database/sqlConnection');

// Utility function to handle database queries with proper error handling
async function queryDatabase(query, params = []) {
    const connection = await pool.getConnection();
    try {
        const [rows] = await connection.query(query, params);
        return rows;
    } catch (error) {
        throw error;
    } finally {
        connection.release();
    }
}

// Modified select-bot route
router.get('/dashboard/select-bot', isLoggedIn, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const offset = (page - 1) * limit;
        const showFavorites = req.query.favorites === 'true';
        const userId = req.session.user.id;
 console.log('Views directory:', express.get('views')); // Debugging

        let query = `
            SELECT 
                b.*,
                COALESCE(b.total_deployments, 0) as deployment_count,
                CASE
                    WHEN total_deployments >= 100 THEN 'popular'
                    WHEN total_deployments >= 50 THEN 'rising'
                    ELSE 'standard'
                END as popularity_tier,
                EXISTS(
                    SELECT 1 FROM favorite_bots 
                    WHERE bot_id = b.id AND user_id = ?
                ) as is_favorite
            FROM bots b
            WHERE b.is_suspended = FALSE
        `;
        
        if (showFavorites) {
            query += ` AND EXISTS (SELECT 1 FROM favorite_bots fb WHERE fb.bot_id = b.id AND fb.user_id = ?)`;
        }
        
        query += ` ORDER BY total_deployments DESC, name ASC LIMIT ? OFFSET ?`;
        
        const queryParams = showFavorites 
            ? [userId, userId, limit, offset]
            : [userId, limit, offset];
        
        const bots = await queryDatabase(query, queryParams);
        
        const countQuery = showFavorites
            ? `SELECT COUNT(*) as total FROM bots b WHERE b.is_suspended = FALSE AND EXISTS (SELECT 1 FROM favorite_bots fb WHERE fb.bot_id = b.id AND fb.user_id = ?)`
            : `SELECT COUNT(*) as total FROM bots b WHERE b.is_suspended = FALSE`;
        const countParams = showFavorites ? [userId] : [];
        const countResult = await queryDatabase(countQuery, countParams);
        
        const totalBots = countResult[0].total;
        const totalPages = Math.ceil(totalBots / limit);
        
        res.render('select-bot', { 
            bots,
            currentPage: page,
            totalPages,
            totalBots,
            userId,
            showFavorites
        });
    } catch (error) {
        console.error('Error fetching bots:', error);
        res.status(500).json({ error: 'An error occurred while fetching bots' });
    }
});

// Search bots route
router.get('/api/search-bots', isLoggedIn, async (req, res) => {
    try {
        const searchTerm = req.query.term?.toLowerCase() || '';
        const userId = req.session.user.id;
        const showFavorites = req.query.favorites === 'true';

        let query = `
            SELECT 
                b.*,
                COALESCE(b.total_deployments, 0) as deployment_count,
                CASE
                    WHEN total_deployments >= 100 THEN 'popular'
                    WHEN total_deployments >= 50 THEN 'rising'
                    ELSE 'standard'
                END as popularity_tier,
                EXISTS(
                    SELECT 1 FROM favorite_bots 
                    WHERE bot_id = b.id AND user_id = ?
                ) as is_favorite
            FROM bots b
            WHERE b.is_suspended = FALSE 
            AND LOWER(b.name) LIKE ?
        `;

        if (showFavorites) {
            query += ` AND EXISTS (SELECT 1 FROM favorite_bots fb WHERE fb.bot_id = b.id AND fb.user_id = ?)`;
        }

        query += ` ORDER BY total_deployments DESC, name ASC`;
        
        const queryParams = showFavorites 
            ? [userId, `%${searchTerm}%`, userId]
            : [userId, `%${searchTerm}%`];

        const bots = await queryDatabase(query, queryParams);
        res.json(bots);
    } catch (error) {
        console.error('Error searching bots:', error);
        res.status(500).json({ error: 'Failed to search bots' });
    }
});

module.exports = router;
