

// custom lexer...
  console.log('The moment the custom lexer gets defined...');
  var lexer = {
    lex: function () {
      return 1;
    },
    setInput: function (s, yy) {
      console.log('setInput: ', s, yy);
    },
    options: {

    },
    ERROR: 2,
    EOF: 1, 
  };


//=============================================================================
//                     JISON-LEX OPTIONS:

const lexerSpecConglomerate = {
  lexerActionsUseYYLENG: '???',
  lexerActionsUseYYLINENO: '???',
  lexerActionsUseYYTEXT: '???',
  lexerActionsUseYYLOC: '???',
  lexerActionsUseParseError: '???',
  lexerActionsUseYYERROR: '???',
  lexerActionsUseLocationTracking: '???',
  lexerActionsUseMore: '???',
  lexerActionsUseUnput: '???',
  lexerActionsUseReject: '???',
  lexerActionsUseLess: '???',
  lexerActionsUseDisplayAPIs: '???',
  lexerActionsUseDescribeYYLOC: '???',
  lex_rule_dictionary: {
    rules: [],
    macros: {},
    startConditions: {},
    codeSections: [
      {
        qualifier: 'init',
        include: "console.log('init')",
      },
      {
        qualifier: '__misc__',
        include: "console.log('_x_misc_x_')",
      },
    ],
    importDecls: [],
    unknownDecls: [],
    actionInclude: `// custom lexer...
  console.log('The moment the custom lexer gets defined...');
  var lexer = {
    lex: function () {
      return 1;
    },
    setInput: function (s, yy) {
      console.log('setInput: ', s, yy);
    },
    options: {

    },
    ERROR: 2,
    EOF: 1, 
  }`,
  },
  codeSections: [
    {
      qualifier: 'init',
      include: "console.log('init')",
    },
    {
      qualifier: '__misc__',
      include: "console.log('_x_misc_x_')",
    },
  ],
  importDecls: [],
  unknownDecls: [],
  options: {
    moduleType: 'commonjs',
    debug: false,
    enableDebugLogs: false,
    json: true,
    noMain: true,
    moduleMain: null,
    moduleMainImports: null,
    dumpSourceCodeOnFailure: true,
    throwErrorOnCompileFailure: true,
    doNotTestCompile: false,
    defaultModuleName: 'lexer',
    xregexp: false,
    lexerErrorsAreRecoverable: false,
    flex: false,
    backtrack_lexer: false,
    ranges: false,
    trackPosition: true,
    caseInsensitive: false,
    exportSourceCode: {
      enabled: false,
    },
    exportAST: false,
    prettyCfg: true,
  },
  conditions: {
    INITIAL: {
      rules: [],
      inclusive: true,
    },
  },
  performAction: `function lexer__performAction(yy, yyrulenumber, YY_START) {
            const yy_ = this;

            // custom lexer...
  console.log('The moment the custom lexer gets defined...');
  var lexer = {
    lex: function () {
      return 1;
    },
    setInput: function (s, yy) {
      console.log('setInput: ', s, yy);
    },
    options: {

    },
    ERROR: 2,
    EOF: 1, 
  }
const YYSTATE = YY_START;
/* no rules ==> no rule SWITCH! */
        }`,
  caseHelperInclude: `{

}`,
  rules: [],
  macros: {},
  regular_rule_count: 0,
  simple_rule_count: 0,
  conditionStack: [
    'INITIAL',
  ],
  actionInclude: `// custom lexer...
  console.log('The moment the custom lexer gets defined...');
  var lexer = {
    lex: function () {
      return 1;
    },
    setInput: function (s, yy) {
      console.log('setInput: ', s, yy);
    },
    options: {

    },
    ERROR: 2,
    EOF: 1, 
  }`,
  moduleInclude: '',
  __in_rules_failure_analysis_mode__: false,
  is_custom_lexer: true,
}

