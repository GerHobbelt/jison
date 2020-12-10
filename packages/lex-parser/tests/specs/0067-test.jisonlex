//
// title: "regex pipe symbol in JS action code: a | b"
// test_input: 'axabxxaaa'
// 
// ...
// 
// test a large set of action code patterns which are specifically targetting particular
// lexer rules: these serve as regression tests and power checks to ensure our lexer
// does indeed handle these as one might (or might not) expect; when it doesn't cope
// well, these should cause a failure in the parser, ideally...
//
//--- and finally, when we want pipe to be interpreted as OR operator in lexer rule spec:
//

%%
a return 10
|b return 12;
  //
"x" return 11;
  //

