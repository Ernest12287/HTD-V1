const express = require('express');
const router = express.Router();

router.get('/check-login', (req, res) => {
    // If session doesn't exist, user is not logged in
    if (!req.session || !req.session.user) {
        return res.status(401).json({ message: 'User not logged in' });
    }

    const user = req.session.user;

    // If user is banned
    if (user.is_banned === 1) {
        return res.status(200).json({ user }); // Return the session with is_banned status
    }

    // User is logged in and not banned
    return res.json({ user });
});


module.exports = router;
