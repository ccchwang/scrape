var express = require('express');
var router = express.Router();
const rp = require('request-promise');
const $ = require('cheerio');
var { RawStatements, Statements } = require('../database/index')


/**************************************
  Utility
***************************************/

let failedFetchStatements = []; // Should be 4384
let failedFetchStatementsModified = false;
let failedDbStatements = {};
let successfullySavedStatements = [];

const renderPage = function(res, title) {
  let failedFetch = failedFetchStatements.map(statement => statement.url).sort();

  res.render('index', {
    title,
    failedDbStatements,
    failedFetchStatements: failedFetch,
    failedFetchStatementsModified,
    successfullySavedStatements,
  })
}

const createStatementFetchPromises = function(possibleStatements) {
  return possibleStatements.map(({ day, month, year, url }) => {
    return rp(url)
      .then(html => ({
          month,
          html,
          date: new Date(month + '/' + day + '/' + year)
        })
      )
      .catch(() => {
        failedFetchStatements.push({ day, month, year, url });
        return;
      })
  })
}

const createStatementDbPromises = function(statements) {
  return statements.filter(s => s !== undefined).map(statement => 
    RawStatements.create(statement)
      .then(success => successfullySavedStatements.push(success))
      .catch(err => {
        let errorMsg = err.message.replace(' ', '_');
        failedDbStatements[errorMsg] = failedDbStatements[errorMsg] ? failedDbStatements[errorMsg] : [];
        failedDbStatements[errorMsg].push(err);
      })
  );
}


/**************************************
  1. Fetch Statements
***************************************/

router.get('/fetch-statements', function(req, res, next) {

  /**************************************
    Get all possible statements.
  ***************************************/
  let startDate = new Date('1/7/1998');
  let endDate = new Date();

  let possibleStatements = [];

  while (startDate.toLocaleDateString() !== endDate.toLocaleDateString()) {
    let formatted = startDate.toLocaleDateString('en-us', {
      month: "2-digit", 
      day: "2-digit", 
      year: "2-digit"
    })

    let year = formatted[6] + formatted[7];
    let month = formatted[0] + formatted[1];
    let day = formatted[3] + formatted[4];

    possibleStatements.push({
      day,
      month,
      year,
      url: `https://fms.treas.gov/fmsweb/viewDTSFiles?dir=a&fname=${year + month + day}00.txt`
    })

    startDate = new Date(startDate.setDate(startDate.getDate() + 1));
  }


  /**************************************
    Create promises to fetch statements and data.
  ***************************************/

  let fetchPromises = createStatementFetchPromises(possibleStatements);

  
  /**************************************
   Fetch statements and save.
   Then render page with error info.
   ***************************************/
  
  Promise.all(fetchPromises)
    .then(s => {
      let dbSavePromises = createStatementDbPromises(s);

      Promise.all(dbSavePromises)
        .then(() => renderPage(res, "1) Fetched Statement Data from URLs - SUCCESS fetch and saved to db"))
        .catch(() => renderPage(res, "1) Fetched Statement Data from URLs - FAILED to save to db"))
    })
    .catch(() => renderPage(res, "1) Fetched Statement Data from URLs - FAILED to fetch statements"))
});


/**************************************
  2. Fetch Latest Statements
***************************************/

router.get('/latest-statements', function(req, res, next) {
  rp("https://www.fms.treas.gov/fmsweb/DTSFilesDisplayAction.do")
    .then(html => {
      let links = [].slice.call($('a', html));
      let possibleStatements = [];

      // Find .txt links and push to possible statements
      links.forEach(link => {
        if (link.attribs.href.includes('.txt')) {
          possibleStatements.push(link.attribs.href);
        }
      });

      // Bind date & url data to possible statements
      possibleStatements = possibleStatements.map(statement => {
        let dateData = statement.match(/\d+/g)[0];
        let year = dateData[0] + dateData[1];
        let month = dateData[2] + dateData[3];
        let day = dateData[4] + dateData[5];
        let end = dateData[6] + dateData[7];

        return {
          day,
          month,
          year,
          url: `https://fms.treas.gov/fmsweb/viewDTSFiles?dir=w&fname=${year + month + day + end}.txt`
        }
      })
      
      // Create promises to fetch statements and data.
      let fetchPromises = createStatementFetchPromises(possibleStatements);

      // Fetch statements and save. Then render page with error info.
      Promise.all(fetchPromises)
        .then(s => {
          let dbSavePromises = createStatementDbPromises(s);

          Promise.all(dbSavePromises)
            .then(() => renderPage(res, "2) Fetched Latest Statements from URLs - SUCCESS fetch and saved to db"))
            .catch(() => renderPage(res, "2) Fetched Latest Statements from URLs - FAILED to save to db"))
        })
        .catch(() => renderPage(res, "2) Fetched Latest Statements from URLs - FAILED to fetch from URLs"))
    })
    .catch(() => renderPage(res, "2) failed to get HTML page to create latest statement links"))
})


/**************************************
  3. Refetch Outstanding Statements
***************************************/

router.get('/refetch-statements', function(req, res, next) {
  if (failedFetchStatements.length) {
    let statements = failedFetchStatements;
    let shouldModify = Object.keys(req.query).length;

    if (shouldModify) {
      statements = failedFetchStatements.map(statement => {
        statement.url = statement.url.replace('00.txt', '01.txt');
        return statement;
      });

      failedFetchStatementsModified = true;
    }

    let fetchPromises = createStatementFetchPromises(statements);
    failedFetchStatements = [];

    Promise.all(fetchPromises)
      .then(s => {
        let dbSavePromises = createStatementDbPromises(s);
        failedDbStatements = {};

        Promise.all(dbSavePromises)
          .then(() => renderPage(res, "3) Refetched Statement Data from URLs - SUCCESS fetch and saved to db"))
          .catch(() => renderPage(res, "3) Refetched Statement Data from URLs - FAILED to save to db"))
      })
      .catch(() => renderPage(res, "3) Refetched Statement Data from URLs - FAILED to refetch from URLs"))
  } 
  else {
    renderPage(res, "3) No refetch necessary - no existing failed statements")
  }
})


/**************************************
  Other Work
***************************************/

const setStatementDay = function(statements) {
  let sMonth;
  let sDay;

  return statements.map(({ date, month, html }) => {
    sDay = (!sDay || sMonth !== month) ? 1 : sDay += 1;
    sMonth = (!sMonth || sMonth !== month) ? month : sMonth;

    return {
      html,
      date,
      statementDay: sMonth + '-' + sDay,
    }
  })
}

const setNumbers = function(statements) {
  return statements.map(statement => {
    let snapLine = statement.html.match(/Supple\. Nutrition Assist\. Program \(SNAP\).+/g) ||
                   statement.html.match(/Food Stamps.+/g);

    let snap = snapLine ? Number(snapLine[0].match(/\S+$/g)[0].replace(',', '')) : 0;
    statement.snap = snap;

    delete statement.html;
    return statement;
  })
}

router.get('/get-numbers', function(req, res, next) {
  RawStatements.findAll({order: [['date', 'ASC']]})
    .then(s => {
      let statements = setStatementDay(s);
      statements = setNumbers(statements);

      statements.forEach(statement =>
        Statements.create(statement)
          .then(success => console.log('success saving statement'))
          .catch(err => console.log('err saving statement', err))
      )
    })
    .catch(err => console.log('failed to get statements from db'))


  /**************************************
    Render page.
  ***************************************/
  res.render('index', { title: "3) Got Numbers from Statements in DB" });
});


/**************************************
  Homepage
***************************************/

router.get('/', function(req, res, next) {
  renderPage(res, "Homepage");
});


module.exports = router;
