const Sequelize = require('sequelize');
const p = require('../p');

const db = new Sequelize('treasury', 'postgres', p, {
  host: 'localhost',
  dialect: 'postgres',
  logging: false
});

const Statements = db.define('statements', {
  date: {
    type: Sequelize.DATE,
    allowNull: false,
    primaryKey: true
  },
  month: {
    type: Sequelize.STRING
  },
  html: {
    type: Sequelize.TEXT,
    allowNull: false,
    validate: {
      len: [25]
    }
  },
  statementDay: {
    type: Sequelize.STRING
  },
  priorStatementDate: {
    type: Sequelize.DATE
  },
  publicDebtCashIssues: {
    type: Sequelize.INTEGER
  },
  publicDebtCashIssuesYoY: {
    type: Sequelize.INTEGER
  },
  totalWithdrawalsMTD: {
    type: Sequelize.INTEGER
  },
  publicCashRedempMTD: {
    type: Sequelize.INTEGER
  },
  totalNetSpendingMTD: {
    type: Sequelize.INTEGER
  },
  totalWithdrawalsYTD: {
    type: Sequelize.INTEGER
  },
  publicCashRedempYTD: {
    type: Sequelize.INTEGER
  },
  totalNetSpendingYTD: {
    type: Sequelize.INTEGER
  },
  totalNetSpendingYTDYoY: {
    type: Sequelize.INTEGER
  },
  totalNetSpendingYTDYoYPercent: {
    type: Sequelize.DECIMAL
  },
  interestTreasurySec: {
    type: Sequelize.INTEGER
  },
  interestTreasurySecYoY: {
    type: Sequelize.INTEGER
  },
  interestTreasurySecYoYPercent: {
    type: Sequelize.DECIMAL
  },
  snap: {
    type: Sequelize.INTEGER
  },
  snapYoY: {
    type: Sequelize.INTEGER
  },
  unemployInsuranceBenefits: {
    type: Sequelize.INTEGER
  },
  unemployInsuranceBenefitsYoY: {
    type: Sequelize.INTEGER
  },
  withheldIncomeEmployTax: {
    type: Sequelize.INTEGER
  },
  withheldIncomeEmployTaxYoY: {
    type: Sequelize.INTEGER
  },
  withheldIncomeEmployTaxYoYPercent: {
    type: Sequelize.DECIMAL
  },
  corporationIncomeTax: {
    type: Sequelize.INTEGER
  },
  corporationIncomeTaxYoY: {
    type: Sequelize.INTEGER
  },
  totalCashFTDs: {
    type: Sequelize.INTEGER
  },
  totalCashFTDsYoY: {
    type: Sequelize.INTEGER
  },
});

module.exports = {
  db,
  Statements
};