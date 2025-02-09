const countryPrefixes = require('./countryPrefixes');
const pool = require('../database/sqlConnection')

// Middleware to attach user's country to request
async function attachUserCountry(req, res, next) {
try {
if (!req.session?.user?.id) {
    req.userCountry = 'ALL';
    return next();
}

// Get user's country from database
const [user] = await pool.query(
    'SELECT phone_number, country_code FROM users WHERE id = ?',
    [req.session.user.id]
);

if (user.length === 0) {
    req.userCountry = 'ALL';
    return next();
}

if (!user[0].country_code && user[0].phone_number) {
    // Determine country from phone number
    const countryCode = getCountryFromPhone(user[0].phone_number);
    
    // Update user's country code in database
    await pool.query(
        'UPDATE users SET country_code = ? WHERE id = ?',
        [countryCode, req.session.user.id]
    );
    
    req.userCountry = countryCode;
} else {
    req.userCountry = user[0].country_code || 'ALL';
}

next();
} catch (error) {
console.error('Error in attachUserCountry middleware:', error);
req.userCountry = 'ALL';
next();
}
}


function getCountryFromPhone(phoneNumber) {
    // Remove any non-digit characters
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    // Check for matches from longest to shortest prefix
    for (let i = 4; i >= 1; i--) {
    const prefix = cleanNumber.substring(0, i);
    if (countryPrefixes[prefix]) {
        return countryPrefixes[prefix];
    }
    }
    
    return 'ALL'; // Default fallback
    }
    
module.exports = attachUserCountry;