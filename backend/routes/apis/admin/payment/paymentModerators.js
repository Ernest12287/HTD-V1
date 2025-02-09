const express = require('express')
const router = express.Router();
const isAdmin = require('../../../../middlewares/isAdmin')
const pool = require('../../../../database/sqlConnection')



// Get all moderators
router.get('/api/moderators', isAdmin, async (req, res) => {
    try {
    const [moderators] = await pool.query(`
        SELECT 
            m.id,
            m.status,
            m.created_at,
            u.phone_number
        FROM moderators m
        JOIN users u ON m.user_id = u.id
        WHERE m.status != 'deleted'
        ORDER BY m.created_at DESC
    `);
    
    // Get countries for each moderator
    for (let mod of moderators) {
        const [countries] = await pool.query(`
            SELECT country_code
            FROM moderator_countries
            WHERE moderator_id = ?
        `, [mod.id]);
        mod.countries = countries.map(c => c.country_code);
    }
    
    res.json({ moderators });
    } catch (error) {
    console.error('Error fetching moderators:', error);
    res.status(500).json({ error: 'Failed to fetch moderators' });
    }
    });
    
    // Update the moderators endpoint to include better error handling
    router.post('/api/moderators', isAdmin, async (req, res) => {
    const connection = await pool.getConnection();
    try {
    await connection.beginTransaction();
    
    const { phone_number, countries } = req.body;
    
    if (!phone_number) {
        throw new Error('Phone number is required');
    }
    
    if (!Array.isArray(countries) || countries.length === 0) {
        throw new Error('At least one country must be selected');
    }
    
    // Check if phone_number exists in the users table and get the corresponding user_id
    const [user] = await connection.query(
        'SELECT id FROM users WHERE phone_number = ?',
        [phone_number]
    );
    
    if (user.length === 0) {
        throw new Error(`User with phone number ${phone_number} does not exist`);
    }
    
    // Check if user is already a moderator
    const [existingModerator] = await connection.query(
        'SELECT id FROM moderators WHERE user_id = ?',
        [user[0].id]
    );
    
    if (existingModerator.length > 0) {
        throw new Error('User is already a moderator');
    }
    
    const user_id = user[0].id;
    
    // Insert moderator
    const [result] = await connection.query(
        'INSERT INTO moderators (user_id, status) VALUES (?, "active")',
        [user_id]
    );
    
    // Add country assignments
    for (const country_code of countries) {
        await connection.query(
            'INSERT INTO moderator_countries (moderator_id, country_code) VALUES (?, ?)',
            [result.insertId, country_code]
        );
    }
    
    await connection.commit();
    res.json({ message: 'Moderator created successfully' });
    } catch (error) {
    await connection.rollback();
    console.error('Error creating moderator:', error);
    res.status(400).json({ error: error.message });
    } finally {
    connection.release();
    }
    });
    
    
    
    
    // Get single moderator
    router.get('/api/moderators/:id', isAdmin, async (req, res) => {
    try {
    const [moderator] = await pool.query(`
        SELECT 
            m.id,
            m.status,
            m.created_at,
            u.phone_number
        FROM moderators m
        JOIN users u ON m.user_id = u.id
        WHERE m.id = ?
    `, [req.params.id]);
    
    if (moderator.length === 0) {
        return res.status(404).json({ error: 'Moderator not found' });
    }
    
    const [countries] = await pool.query(`
        SELECT country_code
        FROM moderator_countries
        WHERE moderator_id = ?
    `, [req.params.id]);
    
    moderator[0].countries = countries.map(c => c.country_code);
    res.json(moderator[0]);
    } catch (error) {
    console.error('Error fetching moderator:', error);
    res.status(500).json({ error: 'Failed to fetch moderator' });
    }
    });
    
    // Toggle moderator status
    router.post('/api/moderators/:id/toggle-status', isAdmin, async (req, res) => {
    const connection = await pool.getConnection();
    try {
    await connection.beginTransaction();
    
    const [currentStatus] = await connection.query(
        'SELECT status FROM moderators WHERE id = ?',
        [req.params.id]
    );
    
    if (currentStatus.length === 0) {
        throw new Error('Moderator not found');
    }
    
    const newStatus = currentStatus[0].status === 'active' ? 'inactive' : 'active';
    
    await connection.query(
        'UPDATE moderators SET status = ? WHERE id = ?',
        [newStatus, req.params.id]
    );
    
    await connection.commit();
    res.json({ message: 'Status updated successfully', status: newStatus });
    } catch (error) {
    await connection.rollback();
    console.error('Error toggling moderator status:', error);
    res.status(500).json({ error: 'Failed to toggle status' });
    } finally {
    connection.release();
    }
    });
    
    // Delete moderator
    router.delete('/api/moderators/:id', isAdmin, async (req, res) => {
    const connection = await pool.getConnection();
    try {
    await connection.beginTransaction();
    
    // Soft delete by setting status to 'deleted'
    await connection.query(
        'UPDATE moderators SET status = ? WHERE id = ?',
        ['deleted', req.params.id]
    );
    
    await connection.commit();
    res.json({ message: 'Moderator deleted successfully' });
    } catch (error) {
    await connection.rollback();
    console.error('Error deleting moderator:', error);
    res.status(500).json({ error: 'Failed to delete moderator' });
    } finally {
    connection.release();
    }
    });
        