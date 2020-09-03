import express from 'express'
const app = express()
import bodyParser from 'body-parser'
import moment from 'moment'

import cors from 'cors'

import mongoose from 'mongoose'
mongoose.connect(process.env.MLAB_URI || 'mongodb://localhost/exercise-track', { 
  useNewUrlParser: true,
  useUnifiedTopology:true
})

/* Mongoose Setup */
// Create Schema
const userSchema = new mongoose.Schema({
  username: String,
  log: [ 
    {
      description: String,
      duration: Number,
      date: { type: Date, default: Date.now }
    }
  ]
}, {
  toJSON: {
    getters: true
  },
  versionKey: false,
  id: false
})

// Add exercise count virtual to schema
userSchema.virtual('count')
  .get(function () { return this.log.length });


// Create model
const userModel = mongoose.model('userModel', userSchema);


/* Express Setup */
app.use(cors())
app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())
app.use(express.static('public'))

/* Routes */

// Default/Root serve index.html
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

/* API Routes */

// Create new user
app.post('/api/exercise/new-user', (req, res) => {
  // Create new user
  let newUser = new userModel({username: req.body.username});
  
  // Save new user
  newUser.save((err, user) => {
    if(err) console.log(err)
    res.send(user);
  })
})

// Get complete user list
app.get('/api/exercise/users', (req, res) => {
  // Find all user documents
  userModel.find({}, (err, users) => {
    if(err) console.log(err)
    console.log(users)
    res.send(users)
  })
})

// Add exercise
app.post('/api/exercise/add', (req, res) => {
  // Find the user to update
  userModel.findById(req.body.userId, (err, user) => {
    if(err) {
      console.log(err)
      res.status(404).send(`User '${req.body.userUd}' Not Found`)
      return
    }
    
    let exerciseFields = {
      description: req.body.description,
      duration: Number.parseInt(req.body.duration),
      date: req.body.date !== '' ? new Date(req.body.date) : new Date() 
    } 
    
    console.log(exerciseFields)

    // Append the new Exercise
    user.log.push(exerciseFields)
    
    // Save the updated user
    user.save((err, savedUser) => {
      if(err) console.log(err)
      
      // Recast the date to remove the timezone offset
      // Relevant when the server is not set to UTC
      let displayDate = moment(exerciseFields.date)
        .add(1 + new Date().getTimezoneOffset()/60, "h")
        .toDate().toDateString()
      
      let sendData = {
        _id: savedUser._id,
        username: savedUser.username,
        description: exerciseFields.description,
        duration: exerciseFields.duration,
        date: displayDate
      }

      res.send(sendData)
    })
    
  })
})

// Query Exercise Log
app.get('/api/exercise/log', (req, res) => {
  // Find the user 
  let query = [
    { $match: { "_id": mongoose.Types.ObjectId(req.query.userId) }},
  ];
  let conditions = [ 1 ];
  let project = [];
  
  if(req.query.from !== '') {
    conditions.push({
      $gte: ['$$item.date', new Date(req.query.from)]
    })
  }
  
  if(req.query.to !== '') {
    conditions.push({
      $lte: ['$$item.date',new Date(req.query.to)]
    })
  }
  
  // If we have date conditions, add them to the pipeline
  if(conditions.length > 1) {
    query.push({
      $project: {
        log: {
          $filter: {
            input: '$log',
            as: 'item',
            cond: { $and:
              conditions
            }
          }
        },
        username: 1,
        count: 1
      }
    });
  }

  // If we have a limit AND it's a number, add it to the pipeline
  if(req.query.limit !== '' && !isNaN(Number.parseInt(req.query.limit))) {
    query.push({
      $project: {
        log: {
          $slice: [ '$log', Number.parseInt(req.query.limit)  ]
        },
        username: 1,
        count: 1
      }
    });
  }
 
  userModel.aggregate(query,(err, result) => {
    if(err) console.log(err)

    // Reformat the date to the "standard" format
    result = result.map((user) => {
      user.log = user.log.map((logEntry) => {
        logEntry.date = logEntry.date.toDateString();
        return logEntry;
      })
      return user;
    })
    
    // Only send the first result
    res.send(result[0])  
  })
})

// Not found middleware
app.use((req, res, next) => {
  return next({status: 404, message: 'not found'})
})

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage

  if (err.errors) {
    // mongoose validation error
    errCode = 400 // bad request
    const keys = Object.keys(err.errors)
    // report the first validation error
    errMessage = err.errors[keys[0]].message
  } else {
    // generic or custom error
    errCode = err.status || 500
    errMessage = err.message || 'Internal Server Error'
  }
  res.status(errCode).type('txt')
    .send(errMessage)
})

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
