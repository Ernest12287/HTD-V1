// Required dependencies
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const isAdmin = require('../../../middlewares/isAdmin');
const pool = require('../../../database/sqlConnection');

// Validation middleware
const validateContact = [
    body('name')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Name must be between 2 and 50 characters'),
    body('email')
        .trim()
        .isEmail()
        .normalizeEmail()
        .withMessage('Please enter a valid email address'),
    body('subject')
        .trim()
        .isLength({ min: 5, max: 100 })
        .withMessage('Subject must be between 5 and 100 characters'),
    body('message')
        .trim()
        .isLength({ min: 10, max: 1000 })
        .withMessage('Message must be between 10 and 1000 characters')
];

// Rate limiting middleware
const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour window
    max: 5, // limit each IP to 5 requests per windowMs
    message: 'Too many contact requests from this IP, please try again after an hour'
});

// POST endpoint to handle contact form submissions
router.post('/api/contact', contactLimiter, validateContact, async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // Insert contact message into MySQL database
        const { name, email, subject, message } = req.body;
        const [result] = await pool.execute(
            'INSERT INTO ContactMessages (name, email, subject, message) VALUES (?, ?, ?, ?)',
            [name, email, subject, message]
        );

        // Send success response
        res.status(201).json({
            message: 'Contact message received successfully',
            contactId: result.insertId
        });

    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({
            message: 'An error occurred while processing your request'
        });
    }
});


// GET endpoint to retrieve contact messages (protected admin route)
// GET endpoint to retrieve contact messages (protected admin route)
router.get('/admin/api/contact', isAdmin, async (req, res) => {
    try {
        const [messages] = await pool.execute(
            'SELECT * FROM ContactMessages ORDER BY createdAt DESC LIMIT 100'
        );

        res.json(messages);

    } catch (error) {
        console.error('Error fetching contact messages:', error);
        res.status(500).json({
            message: 'An error occurred while fetching contact messages'
        });
    }
});

module.exports = router;

module.exports = router;
