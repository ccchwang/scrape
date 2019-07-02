var express = require('express');
var router = express.Router();
const rp = require('request-promise');
const $ = require('cheerio');
var { Statements } = require('../database/index')


/**************************************
  Utility
***************************************/

let failedFetchStatements = []; // Should be 4384
let failedFetchStatementsModified = false;
let failedDbStatements = {};
let successfullySavedStatements = [];
let hashed = {};

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
    Statements.create(statement)
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
  let startDate = new Date('7/1/2005');
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
  1. Fetch Latest Statements
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
            .then(() => renderPage(res, "1) Fetched Latest Statements from URLs - SUCCESS fetch and saved to db"))
            .catch(() => renderPage(res, "1) Fetched Latest Statements from URLs - FAILED to save to db"))
        })
        .catch(() => renderPage(res, "1) Fetched Latest Statements from URLs - FAILED to fetch from URLs"))
    })
    .catch(() => renderPage(res, "1) failed to get HTML page to create latest statement links"))
})


/**************************************
  2. Refetch Outstanding Statements
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
          .then(() => renderPage(res, "2) Refetched Statement Data from URLs - SUCCESS fetch and saved to db"))
          .catch(() => renderPage(res, "2) Refetched Statement Data from URLs - FAILED to save to db"))
      })
      .catch(() => renderPage(res, "2) Refetched Statement Data from URLs - FAILED to refetch from URLs"))
  } 
  else {
    renderPage(res, "2) No refetch necessary - no existing failed statements")
  }
})


/**************************************
  3. Set Statement Days
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

const setStatementDayLatest = function(statements) {
  let sMonth;
  let sDay;
  let modifiedStatements = [];

  for (let i = 0; i < statements.length; i++) {
    let { date, month, html, statementDay } = statements[i];

    if (!statementDay) {
      if (!sMonth) {
        let priorDay = statements[i-1].statementDay;

        sMonth = priorDay[0] + priorDay[1];
        sDay = parseInt(priorDay.match(/\d+$/gm)[0]);
      }
      
      sDay = (!sDay || sMonth !== month) ? 1 : sDay += 1;
      sMonth = (!sMonth || sMonth !== month) ? month : sMonth;
  
      modifiedStatements.push({
        html,
        date,
        statementDay: sMonth + '-' + sDay,
      })
    }
  }

  return modifiedStatements;
}

router.get('/set-days', function(req, res) {
  let setLatest = Object.keys(req.query).length;
  let order = setLatest ? {order: [['date', 'DESC']], limit: 50} : {order: [['date', 'ASC']]}

  Statements.findAll(order)
    .then(s => {
      // Pull needed numbers from statements and prepare to save
      let statements = setLatest ? s.reverse() : s;
      statements     = setLatest ? setStatementDayLatest(statements) : setStatementDay(statements);

      let updateStatementPromises = statements.map(statement => 
        Statements.update(statement, { where: { date: statement.date } })
          .then(success => {})
          .catch(err => {})
      )

      // Save to db
      Promise.all(updateStatementPromises)
        .then(() => renderPage(res, "3) Set Statement Day - SUCCESS update db"))
        .catch(() => renderPage(res, "3) Set Statement Day - FAILED update db"))
    })
    .catch((err) => renderPage(res, "3) Set Statement Day - FAILED to get statements from db"))
})


/**************************************
  4. Set Numbers
***************************************/

const setNumbers = function(statements) {
  return statements.map(statement => {
    let twMTD  = statement.html.match(/Total Withdrawals \(excluding transfers\)\s+\$*\s+\S+\s+\$*\s+\S+/g);
    let pcrMTD = statement.html.match(/Public Debt Cash Redemp. \(Table III-B\)\s+\$*\s+\S+\s+\$*\s+\S+/g);
    let twYTD  = statement.html.match(/Total Withdrawals \(excluding transfers\).+/g);
    let pcrYTD = statement.html.match(/Public Debt Cash Redemp. \(Table III-B\).+/g);
    
    let pdci   = statement.html.match(/Public Debt Cash Issues \(Table III-B\).+/g);
    let its    = statement.html.match(/Interest on Treasury Securities.+/g);
    let snp    = statement.html.match(/Supple\. Nutrition Assist\. Program \(SNAP\).+/g) ||
                   statement.html.match(/Food Stamps.+/g);
    let uib    = statement.html.match(/Unemployment Insurance Benefits.+/g);
    let wiet   = statement.html.match(/Withheld Income and Employment Taxes.+/g);
    let cit    = statement.html.match(/Corporation Income Taxes.+/g);
    let tcf    = statement.html.match(/Total Cash FTD\'s.+/g);


    let totalWithdrawalsMTD  = twMTD ? Number(twMTD[0].match(/\S+$/g)[0].replace(/,/g, '')) : null;
    let publicCashRedempMTD  = pcrMTD ? Number(pcrMTD[0].match(/\S+$/g)[0].replace(/,/g, '')) : null;
    let totalNetSpendingMTD  = twMTD && pcrMTD ? totalWithdrawalsMTD - publicCashRedempMTD : null;
    let totalWithdrawalsYTD  = twYTD ? Number(twYTD[0].match(/\S+$/g)[0].replace(/,/g, '')) : null;
    let publicCashRedempYTD  = pcrYTD ? Number(pcrYTD[0].match(/\S+$/g)[0].replace(/,/g, '')) : null;
    let totalNetSpendingYTD  = twYTD && pcrYTD ? totalWithdrawalsYTD - publicCashRedempYTD : null;

    let publicDebtCashIssues      = pdci ? Number(pdci[0].match(/\S+$/g)[0].replace(/,/g, '')) : null;
    let interestTreasurySec       = its ? Number(its[0].match(/\S+$/g)[0].replace(/,/g, '')) : null;
    let snap                      = snp ? Number(snp[0].match(/\S+$/g)[0].replace(/,/g, '')) : null;
    let unemployInsuranceBenefits = uib ? Number(uib[0].match(/\S+$/g)[0].replace(/,/g, '')) : null;
    let withheldIncomeEmployTax   = wiet ? Number(wiet[0].match(/\S+$/g)[0].replace(/,/g, '')) : null;
    let corporationIncomeTax      = cit ? Number(cit[0].match(/\S+$/g)[0].replace(/,/g, '')) : null;
    let totalCashFTDs             = tcf ? Number(tcf[0].match(/\S+$/g)[0].replace(/,/g, '')) : null;

    return {
      date: statement.date,
      totalWithdrawalsMTD,
      publicCashRedempMTD,
      totalNetSpendingMTD,
      totalWithdrawalsYTD,
      publicCashRedempYTD,
      totalNetSpendingYTD,
      publicDebtCashIssues,
      interestTreasurySec,
      snap,
      unemployInsuranceBenefits,
      withheldIncomeEmployTax,
      corporationIncomeTax,
      totalCashFTDs
    }
  })
}

router.get('/set-numbers', function(req, res) {
  let setLatest = Object.keys(req.query).length;
  let order = setLatest ? {order: [['date', 'DESC']], limit: 32} : {}

  Statements.findAll(order)
    .then(s => {
      // Pull needed numbers from statements and prepare to save
      let statements = setNumbers(s);

      let updateStatementPromises = statements.map(statement => 
        Statements.update(statement, { where: { date: statement.date } })
          .then(success => {})
          .catch(err => {})
      )

      // Save to db
      Promise.all(updateStatementPromises)
        .then(() => renderPage(res, "4) Set Numbers - SUCCESS update db"))
        .catch(() => renderPage(res, "4) Set Numbers - FAILED update db"))
    })
    .catch((err) => renderPage(res, "4) Set Numbers - FAILED to get statements from db"))
})


/**************************************
  5. Create Hash Map of Statement Days
***************************************/

router.get('/hash-days', function(req, res) {
  hashed = {};

  Statements.findAll()
    .then(statements => {
      statements.forEach(statement => {
        let day = statement.statementDay;

        hashed[day] = hashed[day] ? hashed[day] : [];
        hashed[day].push(statement);
      })

      renderPage(res, `5) Created hash map: ${Object.keys(hashed).length} statement days`);
    })
    .catch(() => console.log('Hash days err'))
})


/**************************************
  6. Find Year Priors and Resave Statements
***************************************/

router.get('/get-priors', function(req, res) {
  let setLatest = Object.keys(req.query).length;
  let order = setLatest ? {order: [['date', 'DESC']], limit: 32} : {}

  Statements.findAll(order)
    .then(statements => {
      let updateStatementPromises = [];

      // Create update promises
      statements.forEach(statement => {
        let { 
          date, 
          statementDay,
          totalNetSpendingYTD,
          snap,
          publicDebtCashIssues,
          interestTreasurySec,
          unemployInsuranceBenefits,
          withheldIncomeEmployTax,
          corporationIncomeTax,
          totalCashFTDs
        } = statement;
        
        let yearPrior = date.getFullYear() - 1;
        let pS = hashed[statementDay].filter(s => s.date.getFullYear() === yearPrior)[0];

        if (pS) {
          let yearPriorNums = {
            priorStatementDate            : pS.date,
            totalNetSpendingYTDYoY        : (totalNetSpendingYTD && pS.totalNetSpendingYTD) ? totalNetSpendingYTD - pS.totalNetSpendingYTD : null,
            totalNetSpendingYTDYoYPercent : (totalNetSpendingYTD && pS.totalNetSpendingYTD) ? (totalNetSpendingYTD - pS.totalNetSpendingYTD) / pS.totalNetSpendingYTD : null, 
            snapYoY                       : (snap && pS.snap) ? snap - pS.snap : null,
            publicDebtCashIssuesYoY       : (publicDebtCashIssues && pS.publicDebtCashIssues) ? publicDebtCashIssues - pS.publicDebtCashIssues : null,
            interestTreasurySecYoY        : (interestTreasurySec && pS.interestTreasurySec) ? interestTreasurySec - pS.interestTreasurySec : null,
            interestTreasurySecYoYPercent : (interestTreasurySec && pS.interestTreasurySec) ? (interestTreasurySec - pS.interestTreasurySec) / pS.interestTreasurySec : null,
            unemployInsuranceBenefitsYoY  : (unemployInsuranceBenefits && pS.unemployInsuranceBenefits) ? unemployInsuranceBenefits - pS.unemployInsuranceBenefits : null,
            withheldIncomeEmployTaxYoY    : (withheldIncomeEmployTax && pS.withheldIncomeEmployTax) ? withheldIncomeEmployTax - pS.withheldIncomeEmployTax : null,
            withheldIncomeEmployTaxYoYPercent : (withheldIncomeEmployTax && pS.withheldIncomeEmployTax) ? (withheldIncomeEmployTax - pS.withheldIncomeEmployTax) / pS.withheldIncomeEmployTax : null,
            corporationIncomeTaxYoY       : (corporationIncomeTax && pS.corporationIncomeTax) ? corporationIncomeTax - pS.corporationIncomeTax : null,
            totalCashFTDsYoY              : (totalCashFTDs && pS.totalCashFTDs) ? totalCashFTDs - pS.totalCashFTDs : null
          }

          updateStatementPromises.push(
            Statements.update(yearPriorNums, { where: { date } })
              .then(success => {})
              .catch(err => {})
          )
        }
      })

      // Save to db
      Promise.all(updateStatementPromises)
        .then(() => renderPage(res, "6) Find Year Prior and Resave - SUCCESS update db"))
        .catch(() => renderPage(res, "6) Find Year Prior and Resave - FAILED update db"))
    })
    .catch(() => renderPage(res, `6) Failed to get/save priors: ${Object.keys(hashed).length} hashed statement days`))
})


/**************************************
  Homepage
***************************************/

router.get('/', function(req, res, next) {
  renderPage(res, "Homepage");
});


module.exports = router;
