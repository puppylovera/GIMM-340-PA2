//Libraries
const express = require('express');
const multer = require('multer');
const mysql = require('mysql2/promise');
const { check, checkSchema, validationResult } = require('express-validator');
const path = require('path');

//const course = require('./Model/course');

//Setup defaults for script
const app = express();
app.use(express.json()); // Parse JSON bodies
app.use(express.static('public'))

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname)
    }
});

const upload = multer({ storage: storage })
const port = 80 //Default port to http server

let connection = null;

async function query(sql, params) {
    //Singleton DB connection
    if (null === connection) {
        console.log('Here');
        connection = await mysql.createConnection({
            host: "student-databases.cvode4s4cwrc.us-west-2.rds.amazonaws.com",
            user: "ANDREWHARTLEIN",
            password: "yRhH3xUVrlo4hxzWdwqZzU53VYm8M3i3Fgc",
            database: 'ANDREWHARTLEIN'
        });
    }

    const [results,] = await connection.execute(sql, params);
    return results;
}

//The * in app.* needs to match the method type of the request
app.get(
    '/worlds/',
    upload.none(),
    async (request, response) => {
        let result = {};
        try {
            // result = await course.getAllCourses(request.query);
            let selectSql = `SELECT
                        c.id,
                        title,
                        article,
                        world,
                        concept_Art,
                        author
                    FROM worlds w
                    INNER JOIN content c ON c.world_id = w.id`
            //technonatural t INNER JOIN aj_worlds ajw ON t.world_id = ajw.id`
            whereStatements = [],
                orderByStatements = [],
                queryParameters = [],
                innerJoinStatements = ["technonatural", "the_loss_of_hope", "pupstenia", "auditorium_7", "new_content_test"];

            // if (typeof request.query.world !== 'undefined' && request.query.world.length > 0){
            //     selectSql += request.query.world;
            // }

            // else{
            // selectSql += "* aj_worlds"
            // }

            if (typeof request.query.title !== 'undefined' && request.query.title.length > 0) {
                whereStatements.push('title LIKE ?');
                queryParameters.push("%" + request.query.title + "%")
            }

            if (typeof request.query.article !== 'undefined' && request.query.article === '1') {
                whereStatements.push('article IS NOT NULL');
            }

            if (typeof request.query.art !== 'undefined' && request.query.art === '1') {
                whereStatements.push('concept_Art IS NOT NULL');
            }

            if (typeof request.query.world !== 'undefined' && request.query.world.length > 0) {
                whereStatements.push('world = ?');
                queryParameters.push(request.query.world);
            }
            if (typeof request.query.author !== 'undefined' && request.query.author.length > 0) {
                orderByStatements.push('author ' + (request.query.author.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'));
            }


            //Dynamically add WHERE expressions to SELECT statements if needed
            if (whereStatements.length > 0) {
                selectSql = selectSql + ' WHERE ' + whereStatements.join(' AND ');
            }

            //Dynamically add ORDER BY expressions to SELECT statements if needed
            if (orderByStatements.length > 0) {
                selectSql = selectSql + ' ORDER BY ' + orderByStatements.join(', ');
            }

            //Dynamically add LIMIT expressions to SELECT statements if needed
            if (typeof request.query.limit !== 'undefined' && request.query.limit > 0 && request.query.limit < 6) {
                selectSql = selectSql + ' LIMIT ' + request.query.limit;
            }


            result = await query(selectSql, queryParameters);
        } catch (error) {
            console.log(error);
            return response.status(500) //Error code 
                .json({ message: 'Something went wrong with the server.' });
        }
        //Default response object
        response.json({ 'data': result });
    });

// ============================================
// Validation Rules for Data Entry Form
// ============================================

// Custom validator for conditional fields
const validateConditionalField = (value, { req }) => {
    if (req.body.isArticle && (!value || value.trim() === '')) {
        throw new Error('Article text is required when "Is Article" is checked');
    }
    return true;
};

const validateConceptArtField = (value, { req }) => {
    if (req.body.isConceptArt && !req.file) {
        throw new Error('Concept art file is required when "Is Concept Art" is checked');
    }
    return true;
};

// Validation chain for the add-data endpoint
const addDataValidation = [
    // Title: required, 2-255 characters
    check('title')
        .trim()
        .notEmpty().withMessage('Title is required')
        .isLength({ min: 2, max: 255 }).withMessage('Title must be between 2 and 255 characters'),

    // World: required, must be one of the valid options
    check('world')
        .trim()
        .notEmpty().withMessage('Please select a world')
        .isIn(['Technonatural', 'The Loss Of Hope', 'Pupstenia', 'Auditorium 7', 'New Content Test'])
        .withMessage('Invalid world selected'),

    // Author: required, must be one of the valid options
    check('author')
        .trim()
        .notEmpty().withMessage('Please select an author')
        .isIn(['Andrew Hartlein', 'Thomas Brown'])
        .withMessage('Invalid author selected'),

    // Article: conditional - required when isArticle is true
    check('article')
        .custom(validateConditionalField),

    // Concept Art: conditional - required when isConceptArt is true
    check('conceptArt')
        .custom(validateConceptArtField)
];

// ============================================
// POST endpoint for adding new data
// ============================================
app.post(
    '/add-data',
    upload.single('conceptArt'),  // Handle single file upload
    addDataValidation,
    async (request, response) => {
        // Check for validation errors
        const errors = validationResult(request);
        if (!errors.isEmpty()) {
            return response.status(400).json({
                message: 'Validation failed',
                errors: errors.array().map(err => ({
                    path: err.path,
                    msg: err.msg
                }))
            });
        }

        try {
            const { title, isArticle, article, isConceptArt, world, author } = request.body;

            // Get the file path if a file was uploaded
            const conceptArtPath = request.file ? '/uploads/' + request.file.filename : null;

            // First, get the world_id from the worlds table
            const getWorldIdSql = `SELECT id FROM worlds WHERE world = ?`;
            const worldResults = await query(getWorldIdSql, [world]);

            if (worldResults.length === 0) {
                return response.status(400).json({
                    message: 'Invalid world selected'
                });
            }

            const worldId = worldResults[0].id;

            // Insert into content table
            const insertSql = `INSERT INTO content (title, article, concept_art, world_id, author) VALUES (?, ?, ?, ?, ?)`;
            const queryParameters = [
                title.trim(),
                isArticle ? (article ? article.trim() : null) : null,
                isConceptArt ? conceptArtPath : null,
                worldId,
                author.trim()
            ];

            await query(insertSql, queryParameters);

            response.status(201).json({
                message: 'Data added successfully!'
            });
        } catch (error) {
            console.error('Database error:', error);
            return response.status(500).json({
                message: 'Something went wrong with the server.'
            });
        }
    }
);

// ============================================
// PUT endpoint for updating existing data
// ============================================
app.put(
    '/update-data/:id',
    upload.single('conceptArt'),
    addDataValidation,
    async (request, response) => {
        // Check for validation errors
        const errors = validationResult(request);
        if (!errors.isEmpty()) {
            return response.status(400).json({
                message: 'Validation failed',
                errors: errors.array().map(err => ({
                    path: err.path,
                    msg: err.msg
                }))
            });
        }

        try {
            const { id } = request.params;
            const { title, isArticle, article, isConceptArt, world, author } = request.body;

            // Get the file path if a file was uploaded
            const conceptArtPath = request.file ? '/uploads/' + request.file.filename : null;

            // First, get the world_id from the worlds table
            const getWorldIdSql = `SELECT id FROM worlds WHERE world = ?`;
            const worldResults = await query(getWorldIdSql, [world]);

            if (worldResults.length === 0) {
                return response.status(400).json({
                    message: 'Invalid world selected'
                });
            }

            const worldId = worldResults[0].id;

            // Build the update query dynamically
            let updateSql = `UPDATE content SET title = ?, article = ?, world_id = ?, author = ?`;
            let queryParameters = [
                title.trim(),
                isArticle ? (article ? article.trim() : null) : null,
                worldId,
                author.trim()
            ];

            // Only update concept_art if a new file was uploaded
            if (isConceptArt && conceptArtPath) {
                updateSql += `, concept_art = ?`;
                queryParameters.push(conceptArtPath);
            } else if (!isConceptArt) {
                // If concept art is unchecked, set to null
                updateSql += `, concept_art = NULL`;
            }

            updateSql += ` WHERE id = ?`;
            queryParameters.push(id);

            await query(updateSql, queryParameters);

            response.status(200).json({
                message: 'Data updated successfully!'
            });
        } catch (error) {
            console.error('Database error:', error);
            return response.status(500).json({
                message: 'Something went wrong with the server.'
            });
        }
    }
);

app.listen(port, () => {
    console.log(`Application listening at http://localhost:${port}`);
})