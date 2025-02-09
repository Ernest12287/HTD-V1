const express = require('express');
const router = express.Router();
const pool = require('../../../database/sqlConnection')
const isLoggedIn  = require('../../../middlewares/isLoggedin');
const moment = require('moment-timezone');


// Middleware to ensure Pakistan time zone
router.use((req, res, next) => {
    req.pakistanTime = moment().tz('Asia/Karachi');
    next();
});

// Updated claim-coins route
router.post('/claim-coins', isLoggedIn, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const dailyCoins = 10;
        const pakistanTime = moment().tz('Asia/Karachi');
        
        // Get user data using email
        const [userRows] = await connection.query(
            'SELECT last_claim_time, coins FROM users WHERE email = ? FOR UPDATE',
            [req.session.user.email]
        );

        if (userRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userRows[0];
        const lastClaimTime = user.last_claim_time ? moment(user.last_claim_time).tz('Asia/Karachi') : null;

        // Get Pakistan midnight time
        const pakistanMidnight = pakistanTime.clone().startOf('day');
        const nextPakistanMidnight = pakistanMidnight.clone().add(1, 'day');

        // Check if user has claimed today
        if (lastClaimTime && lastClaimTime.isAfter(pakistanMidnight)) {
            await connection.rollback();
            return res.status(400).json({
                message: 'You can only claim coins once per day',
                nextClaimTime: nextPakistanMidnight.format(),
                currentCoins: user.coins,
                error: true
            });
        }

        // Update coins and last claim time
        const updateResult = await connection.query(
            'UPDATE users SET coins = coins + ?, last_claim_time = ? WHERE email = ?',
            [dailyCoins, pakistanTime.format('YYYY-MM-DD HH:mm:ss'), req.session.user.email]
        );

        // Log the claim for tracking
        await connection.query(
            'INSERT INTO coin_claims (user_id, claim_amount, claim_time) VALUES (?, ?, ?)',
            [req.session.user.id, dailyCoins, pakistanTime.format('YYYY-MM-DD HH:mm:ss')]
        );

        await connection.commit();

        res.status(200).json({
            message: `${dailyCoins} coins claimed successfully!`,
            currentCoins: user.coins + dailyCoins,
            nextClaimTime: nextPakistanMidnight.format(),
            success: true
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error claiming coins:', error);
        res.status(500).json({
            message: 'An error occurred while claiming coins',
            error: true
        });
    } finally {
        connection.release();
    }
});

// Updated check-claim-status route
router.get('/check-claim-status', isLoggedIn, async (req, res) => {
    try {
        const [userRows] = await pool.query(
            'SELECT last_claim_time, coins FROM users WHERE email = ?',
            [req.session.user.email]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userRows[0];
        const pakistanTime = moment().tz('Asia/Karachi');
        const lastClaimTime = user.last_claim_time ? moment(user.last_claim_time).tz('Asia/Karachi') : null;
        const pakistanMidnight = pakistanTime.clone().startOf('day');
        const nextPakistanMidnight = pakistanMidnight.clone().add(1, 'day');

        // If never claimed or last claim was before today's midnight
        const canClaim = !lastClaimTime || lastClaimTime.isBefore(pakistanMidnight);

        res.json({
            canClaim,
            nextClaimTime: canClaim ? null : nextPakistanMidnight.format(),
            currentCoins: user.coins,
            lastClaimTime: lastClaimTime ? lastClaimTime.format() : null
        });
    } catch (error) {
        console.error('Error checking claim status:', error);
        res.status(500).json({ error: 'An error occurred while checking claim status' });
    }
});
module.exports = router;