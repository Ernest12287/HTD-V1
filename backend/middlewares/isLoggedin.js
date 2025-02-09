const pool = require('../database/sqlConnection');

async function isLoggedIn(req, res, next) {
    // Check if the session contains a user
    if (req.session.user) {
        try {
            // Fetch the latest is_banned status from the database
            const [rows] = await pool.query('SELECT is_banned FROM users WHERE id = ?', [req.session.user.id]);

            // Log the result to check the structure
            // console.log('Query Result:', rows);

            if (rows.length > 0) {
                // Extract the user from the result
                const user = rows[0];  // Since pool.query() returns an array of rows
                // console.log('Banned status:', user.is_banned);

                // Update session with the latest ban status
                req.session.user.is_banned = user.is_banned;

                // If user is banned, redirect to the banned page
                if (user.is_banned === 1) {
                    return res.redirect('/banned');
                }

                // If user is logged in and not banned, proceed to the next middleware
                return next();
            } else {
                // If user not found in the database, log them out
                req.session.destroy(() => {
                    return res.redirect('/auth/login');
                });
            }
        } catch (error) {
            console.error('Error checking ban status:', error);
            return res.redirect('/auth/login');
        }
    } else {
        // If user is not logged in, redirect to the login page
        return res.redirect('/auth/login');
    }
}

module.exports = isLoggedIn;
