const deleteApp = require('../../../../middlewares/deleteApp');
const express = require('express');
const router = express.Router();
const isLoggedIn  = require('../../../../middlewares/isLoggedin');


// the delete route to handle errors better
router.delete('/delete-app/:appName', isLoggedIn,async (req, res) => {
    const { appName } = req.params;

    try {
        // Add request timeout
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout')), 30000); // 30 second timeout
        });

        const deletePromise = deleteApp(appName);
        const result = await Promise.race([deletePromise, timeoutPromise]);

        if (result.success) {
            res.status(200).json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        console.error('Error in delete app route:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            details: error.message
        });
    }
});

module.exports = router;