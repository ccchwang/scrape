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
  statementDay: {
    type: Sequelize.STRING
  },
  snap: {
    type: Sequelize.INTEGER
  },
  snapPriorYear: {
    type: Sequelize.INTEGER
  },
  snapYoY: {
    type: Sequelize.INTEGER
  }
});

const RawStatements = db.define('rawStatements', {
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
  snap: {
    type: Sequelize.INTEGER
  },
  snapPriorYear: {
    type: Sequelize.INTEGER
  },
  snapYoY: {
    type: Sequelize.INTEGER
  }
});

module.exports = {
  db,
  Statements,
  RawStatements
};