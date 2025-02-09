const express = require('express');
const { countries } = require('countries-list');
const router = express.Router();


// Top countries manually set karna
const topCountries = [
    "Pakistan", "India", "Canada", "Australia",
    "Nigeria", "South Africa", "Kenya", "United Arab Emirates"
];

// Route to get all countries with top countries first
router.get('/api/countries', (req, res) => {
    const countryNames = Object.values(countries)
        .map(country => country.name)
        .filter(country => !topCountries.includes(country)) // Filter out top countries from the rest
        .sort(); // Alphabetically sort remaining countries

    // Combine top countries and sorted countries
    const sortedCountries = [...topCountries, ...countryNames];
    res.json(sortedCountries);  // Send the country names as JSON
});
module.exports = router;