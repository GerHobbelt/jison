{
  error: {
    message: `Could not parse jison lexer spec in JSON AUTODETECT mode:
in JISON Mode we get Error: 
Seems you did not correctly bracket a lexer rules set inside
the start condition
  <subsetA> { rules... }
as a terminating curly brace '}' could not be found.
    
  Erroneous area:
 7: <subsetA>{
 8: 
 9: "C"   -> 'C'
10: 
11: <subsetB>{
^^..^
12: 
13: "B"   -> 'B'
    
  Technical error report:
Parse error on line 11:
<subsetB>{
^
Expecting "}", ">", "|", "(", "/", ",", ".", "^", "$", "ACTION_START_AT_SOL", "UNTERMINATED_ACTION_BLOCK", "ACTION_START", "UNKNOWN_DECL", "OPTIONS", "IMPORT", "INIT_CODE", "START_INC", "START_EXC", "SPECIAL_GROUP", "/!", "REGEX_SPECIAL_CHAR", "ESCAPED_CHAR", macro name in '{...}' curly braces, "REGEX_SET_START", "STRING_LIT", "CHARACTER_LIT", "option_keyword", "import_keyword", "init_code_keyword", "start_inclusive_keyword", "start_exclusive_keyword", "rule", "regex", "nonempty_regex_list", "regex_concat", "regex_base", "name_expansion", "any_group_regex", "literal_string", got unexpected "<"


while JSON5 Mode produces Error: JSON5: invalid character '%' at 2:1`,
    type: 'Error',
    stack: `SyntaxError: JSON5: invalid character '%' at 2:1
    at syntaxError (/index.js:1954:16)
    at invalidChar (/index.js:1895:13)
    at Object.value (/index.js:964:16)
    at lex (/index.js:743:41)
    at Object.parse (/index.js:689:18)
    at autodetectAndConvertToJSONformat (/regexp-lexer-cjs.js:13798:51)
    at processGrammar (/regexp-lexer-cjs.js:17013:12)
    at test_me (/regexp-lexer-cjs.js:14862:23)
    at new RegExpLexer (/regexp-lexer-cjs.js:14980:17)
    at Context.testEachLexerExample (/regexplexer.js:3741:25)
    at callFn (/runnable.js:364:21)
    at Test.Runnable.run (/runnable.js:352:5)
    at Runner.runTest (/runner.js:677:10)
    at /runner.js:801:12
    at next (/runner.js:594:14)
    at /runner.js:604:7
    at next (/runner.js:486:14)
    at cbHookRun (/runner.js:551:7)
    at done (/runnable.js:308:5)
    at callFn (/runnable.js:387:7)
    at Hook.Runnable.run (/runnable.js:352:5)
    at next (/runner.js:510:10)
    at Immediate._onImmediate (/runner.js:572:5)
    at processImmediate (/timers.js:456:21)`,
  },
}