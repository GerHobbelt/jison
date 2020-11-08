//
// Stage 2(A) parser: 'The Back End = The Code Generator (Interpreter Style)'
//
// This one represents the classic textbook 'parser/tokenizer' backend:
// using a 'tree walker' to generate 'object code output': in this case
// the 'backend' is tasked to calculate the value for the given formula,
// acting as an Interpreter (of the P-code a.k.a. IR a.k.a. AST Stream),
// rather than as Compiler (see compile_calc_codegen example for that alternative).
//
// The AST is stored in an array and since the AST acts as the INTERFACE
// between front-end and backend of the compiler/engine, its precise format
// is known to both 'parsers': the compile_calc_parse front-end and this
// back-end, plus additional back-ends which feed off the same AST for
// different purposes.
//
// This 'Interpreter' is designed to be FAST, hence the AST stream has been
// constructed the way it is, using a Polish Notation simile: this takes
// the fewest AST nodes and the fewest number of grammar rules to express
// the entire formula calculation power.
//
// We also assume the AST is always valid (errors can be encoded in there, but
// we will exit HARD when your front-end screwed up the AST 'internal structure'
// in any way!), the result of which is that we now have enabled jison to
// recognize the absence of all and any error checking and reporting facilities,
// which our JISON takes as an opportunity to create a severely stripped down,
// FAST grammar parser, hence a very fast 'tree walker'.
//
// Of course, the usual process is to write such a 'tree walker' by hand,
// but I want to showcase the concept here and there's something to say for
// readability as now AST format and actions performed on the atoms is
// nicely separated! :-)
//
// ---
//
// A crucial detail is the use of the `%import` jison feature which allows
// us to import the symbol table generated by jison as part of the front-end
// parser engine: that way we have a guaranteed good set of token #IDs which we
// can use at both ends of the AST stream interface: this allows us to use
// the other JISON feature which is `#<name>` in the action blocks everywhere:
// this will be expanded into the numeric ID of the given token by jison,
// saving us from having to generate and maintain a separate table of IDs
// for our AST objects!
//
// ---
//
// This example also uses the new JISON `%include` feature which allows us
// to include any given source file *verbatim* in our generated jison output.
// Thus we will produce a complete, working, app in a single file here.
// (See near bottom of this jison file.)



// one grammar is MASTER for our common symbol set:
%import symbols  "./output/compiled_calc/compiled_calc_parse.js"







%token      NUM             // Simple double precision number
%token      VAR FUNCTION    // Variable and Function
%token      CONSTANT        // Predefined Constant Value, e.g. PI or E
%token      ERROR           // Mark error in statement
%token      COMMENT         // A line (or multiple lines) of comment

%token      END             // token to mark the end of a function argument list in the output token stream
%token      FUNCTION_0      // optimization: function without any input parameters
%token      FUNCTION_1      // optimization: function with one input parameter
%token      FUNCTION_2      // optimization: function with two input parameters
%token      FUNCTION_3      // optimization: function with three input parameters

%nonassoc   IF_ELSE         // IF ... THEN ... ELSE ...
%nonassoc   IF              // IF ... THEN ... (ELSE nil) -- the 'dangling else' issue has already been resolved by the *parser* hence this AST input stream doesn't suffer from that issue any more!


// %right      '='
%nonassoc   ASSIGN

%nonassoc   XOR
%nonassoc   OR
%nonassoc   AND

%nonassoc   EQ NEQ GEQ LEQ GT LT

// %left       '^'
// %left       '|'
// %left       '&'
%nonassoc   BITWISE_XOR
%nonassoc   BITWISE_OR
%nonassoc   BITWISE_AND

// %left       '-' '+'
// %left       '*' '/' '%'
// %right      POWER
// %right      '~'
// %right      '!' NOT
%nonassoc   ADD SUBTRACT
%nonassoc   MULTIPLY DIVIDE MODULO
%nonassoc   POWER
%nonassoc   BITWISE_NOT
%nonassoc   NOT
%nonassoc   FACTORIAL
%nonassoc   UMINUS     /* Negation--unary minus */
%nonassoc   UPLUS      /* unary plus */
%nonassoc   PERCENT    /* unary percentage */




/* Grammar follows */

%start input



//%options on-demand-lookahead            // camelCased: option.onDemandLookahead
%options default-action-mode=none,merge   // JISON shouldn't bother injecting the default `$$ = $1` action anywhere!
%options no-try-catch                     // we assume this parser won't ever crash and we want the fastest Animal possible! So get rid of the try/catch/finally in the kernel!

%parse-param globalSpace        // extra function parameter for the generated parse() API; we use this one to pass in a reference to our workspace for the functions to play with.



%%


input:
  ε                             /* empty */
                                {
                                  $$ = [];
                                }
| input line EOL
                                {
                                  $input.push($line);
                                  $$ = $input;
                                }
| input COMMENT EOL
                                {
                                  console.log('COMMENT line(s): ', $COMMENT);
                                  $$ = $input;
                                }
;

line:
  exp
                                {
                                  console.log('expression result value: ', $exp);
                                  $$ = $exp;
                                }
| ERROR
                                {
                                  console.log('expression result value: ERROR - erroneous input line');
                                  $$ = NaN;
                                }
;


exp:
  NUM
                                { $$ = $NUM; }
| CONSTANT
                                { $$ = yy.constants[$CONSTANT].value; }
| VAR
                                { $$ = yy.variables[$VAR].value; }
| ASSIGN exp
                                {
                                  /*
                                     Note: #ASSIGN is always to a simple variable, hence we don't need the `#VAR`
                                     token here: it is implicit as there's nothing else we can do.

                                     Technically, this is an AST optimization, but it's such a fundamental one
                                     we do it here instead of later.

                                     NOTE: #ASSIGN implies the presence of a VAR as lhs (left hand side) so it
                                     would only be cluttering the AST stream to have a #VAR# token in there:
                                     it is *implicit* to #assign!
                                   */
                                  $$ = yy.variables[$ASSIGN].value = $exp;
                                }
| FUNCTION_0
                                { $$ = yy.functions[$FUNCTION_0].func.call(globalSpace); }
| FUNCTION arglist END
                                {
                                  /*
                                     A lot of functions have only a few arguments, which we later optimize in our AST
                                     by including that knowledge in the FUNCTION token by using derivative tokens
                                     FUNCTION_0, FUNCTION_1, etc.: this can help a smart optimizer to include
                                     special optimizations for these functions without having to re-discover
                                     the arglist length.
                                     As that approach already disambiguates the function-versus-statement
                                     situation by having encoded arglist length in the FUNCTION token, these
                                     tokens never require a sentinel token in the AST stream: small AST stream size.

                                     Also don't forget to FLATTEN the arglist! ==> `concat.apply(a, arglist)`

                                     NOTE: the #FUNCTION# rule in Polish Notation is ambiguous unless we terminate it
                                     (which is easy to parse in an LALR(1) grammar while adding a argument count is not!)
                                     as we would otherwise get confused over this scenario:

                                          ... PLUS FUNCTION exp exp exp ...

                                     - is this a function with one argument and that last `exp` in there the second term
                                       of a binary(?) opcode waiting in the leading `...`?
                                     - is this a function with two arguments and that last `exp` the second
                                       term of the PLUS?
                                     - is this a function with three arguments and is the second term of the PLUS
                                       waiting in the trailing `...`?

                                     This is the trouble with opcodes which accept a variable number of arguments:
                                     such opcodes always have to be terminated by a sentinel to make the AST grammar
                                     unambiguous.
                                  */
                                  $$ = yy.functions[$FUNCTION].func.apply(globalSpace, $arglist);
                                }
| FUNCTION_1 exp
                                {
                                  $$ = yy.functions[$FUNCTION_1].func.call(globalSpace, $exp);
                                }
| FUNCTION_2 exp exp
                                {
                                  $$ = yy.functions[$FUNCTION_2].func.call(globalSpace, $exp1, $exp2);
                                }
| FUNCTION_3 exp exp exp
                                {
                                  $$ = yy.functions[$FUNCTION_3].func.call(globalSpace, $exp1, $exp2, $exp3);
                                }

| EQ exp exp
                                { $$ = $exp1 == $exp2; }
| NEQ exp exp
                                { $$ = $exp1 != $exp2; }
| LEQ exp exp
                                { $$ = $exp1 <= $exp2; }
| GEQ exp exp
                                { $$ = $exp1 >= $exp2; }
| LT exp exp
                                { $$ = $exp1 < $exp2; }
| GT exp exp
                                { $$ = $exp1 > $exp2; }
| OR exp exp
                                { $$ = $exp1 || $exp2; }
| XOR exp exp
                                { $$ = !!(!!$exp1 ^ !!$exp2); }
| AND exp exp
                                { $$ = $exp1 && $exp2; }

| BITWISE_OR exp exp
                                { $$ = $exp1 | $exp2; }
| BITWISE_XOR exp exp
                                { $$ = $exp1 ^ $exp2; }
| BITWISE_AND exp exp
                                { $$ = $exp1 & $exp2; }

| ADD exp exp
                                { $$ = $exp1 + $exp2; }
| SUBTRACT exp exp
                                { $$ = $exp1 - $exp2; }
| MULTIPLY exp exp
                                { $$ = $exp1 * $exp2; }
| DIVIDE exp exp
                                { $$ = $exp1 / $exp2; }
| MODULO exp exp
                                { $$ = $exp1 % $exp2; }
| UMINUS exp
                                { $$ = -$exp; }
| UPLUS exp
                                { $$ = +$exp; }
| POWER exp exp
                                { $$ = Math.pow($exp1, $exp2); }
| PERCENT exp
                                { $$ = $exp / 100; }
| FACTORIAL exp
                                { $$ = yy.predefined_functions.factorial.call(globalSpace, $exp); }

| BITWISE_NOT exp
                                { $$ = ~$exp; }
| NOT exp
                                { $$ = !$exp; }


| IF_ELSE exp exp exp
                                {
                                  if ($exp1) {
                                    $$ = $exp2;
                                  } else {
                                    $$ = $exp3;
                                  }
                                }
| IF exp exp
                                {
                                  if ($exp1) {
                                    $$ = $exp2;
                                  } else {
                                    $$ = 0;
                                  }
                                }
;

arglist:
  exp
                                { $$ = [$exp]; }
| arglist exp
                                {
                                  $$ = $arglist;
                                  $$.push($exp);
                                }
;





/* End of grammar */


%%


// The compiled grammars for the basic example:
// every phase is driven by a jison-generated tree walker:
%include './output/compiled_calc/compiled_calc_parse.js'
%include './output/compiled_calc/compiled_calc_codegen.js'
%include './output/compiled_calc/compiled_calc_print.js'
%include './output/compiled_calc/compiled_calc_sorcerer.js'
%include './output/compiled_calc/compiled_calc_BURG.js'

// The library of support functions, e.g. symbol table lookup services:
%include 'compiled_calc___support_functions_lib.js'

// The hand-optimized variant of the above compiler/engine phases:
// This stuff is supposed to outperform the jison-generated code as
// we have geared these codes to have the least possible of
// code&call overhead:
// We still *parse* the text input using the parser from above,
// but now all other passes are fully re-engineered.
// Also note the introduction of a (very rudimentary)
// optimization phase, which still employs a jison-based tree walker.
//
// First, we have the PARSER which outputs a new AST suitable for
// the high-speed hand-optimized engine:
%include './output/compiled_calc/compiled_calc_parse_for_fast_engine.js'
// Next, we have the straight-from-AST-stream INTERPRETER:
%include 'compiled_calc_fast_Pcode_interpreter.js'
// Then we have the 'compile-to-native-code' code compiler engine:
%include 'compiled_calc_fast_Pcode_native_code_generator.js'
// And we end this series with the hand-optimized pretty printer:
%include 'compiled_calc_fast_Pcode_pretty_printer.js'

%include 'includes/benchmark.js'





// ------------------- with custom lexer -----------------------

parser.main = function compiledRunner(args) {
    if (!args[1]) {
        console.log('Usage: ' + args[0] + ' FILE');
        return 1;
    }

    /*
     * What you see happening here is:
     *
     * - the first parser parsed the text input and turns it into a token stream (a
     *   serialized AST, as it were)
     * - then the second parser (defined above) is executed, while it is fed the token stream produced
     *   by the first parser:
     *   + the second parser comes with its own minimal, CUSTOM, lexer (see code below)
     *   + the second parser can be made to be ultra-fast as it doesn't need to mind
     *     about detecting human errors (the front-side = first parser took care of that!)
     *     and it doesn't need to mind about human readable notation either: it takes
     *     a AST/token-stream as input which 'happens to be' prepped by the first parser
     *     to be perfect for a Reverse Polish Notation grammar: both parsers have the
     *     same language power, but the second has simpler rules (note that the
     *     '( exp )' subrule is absent as RPN doesn't need such bracketed priority kludges!)
     *
     *   + A THIRD parser COULD be provided to take the token stream from the first
     *     parser and produce human-readable text output from hat stream: this is just
     *     another use of the same power.
     *
     * What is ultimately shown here is a multi-stage compiler/engine:
     *
     * - the first parser is the 'front end' which is facing human input
     * - the second / third / ... parsers are really slightly sophisticated 'tree walkers'
     *   which take the serialized 'intermediate format' (the token stream) and process
     *   it, as fast as possible.
     *
     * When is this useful?
     *
     * For example, when you need to calculate or otherwise machine-process your parsed
     * input many times, and fast, (e.g. when calculating the expression values) while
     * human input parsing costs would be in the way during such calculus processes:
     * now it is separated into a real 'front end'; the 'odd' thing we did here is re-use
     * yacc/jison to also produce the 'internal' stream/tree walkers as well:
     * quite often those are hand-coded, but I chose to showcase the new `%import symbols`
     * feature of JISON, together with the new #TOKEN and #TOKEN# references, both of
     * which are geared towards this specific usage of JISON and your grammars: this way
     * you can use JISON as an advanced tree walker generator for machine format processing too!
     */


    var source = require('fs').readFileSync(require('path').normalize(args[1]), 'utf8');

    console.warn("\n\n\n@@@ 1 : FRONT-END PARSE PHASE @@@\n\n\n");

    // Front End parse: read human input and produce a token stream i.e. serialized AST:
    compiled_calc_parse.yy.parseError = function (msg, info) {
      //compiled_calc_parse.originalParseError(msg, info);
      console.log('### parse Error: ', msg, {
        text: info.text,
        matched_already: info.lexer && info.lexer.matched
      });
      if (info.yy) {
        // prevent reference cycle (memory leak opportunity!): create a new object instead of just referencing `info`:
        info.yy.lastErrorInfo = {
          errStr: msg,
          exception: info.exception,
          text: info.text,
          value: info.value,
          token: info.token,
          token_id: info.token_id,
          line: info.line,
          loc: info.loc,
          expected: info.expected,
          recoverable: info.recoverable,
          state: info.state,
          action: info.action,
          new_state: info.new_state,
          // and limit the stacks to the valid portion, i.e. index [0..stack_pointer-1]:
          symbol_stack: info.symbol_stack && info.symbol_stack.slice(0, info.stack_pointer),
          state_stack: info.state_stack && info.state_stack.slice(0, info.stack_pointer),
          value_stack: info.value_stack && info.value_stack.slice(0, info.stack_pointer).map(function (v) {
            // and remove any cyclic self-references from the vstack copy:
            if (v && v === info.yy.lastErrorInfo) {
              return NaN;
            }
          }),
          location_stack: info.location_stack && info.location_stack.slice(0, info.stack_pointer),
          stack_pointer: info.stack_pointer,
          //yy: info.yy,
          //lexer: info.lexer,
        };
      }

      // and prevent memory leaks via ref cycles:
      info.destroy();
    };
    var toklst = compiled_calc_parse.parse(source);

    console.log('parsed token list: ', JSON.stringify(toklst, null, 2));

    console.warn("\n\n\n@@@ 2 : INTERPRETER BACK-END PARSE PHASE @@@\n\n\n");
    
    const param_count_per_opcode = generate_opcode_param_count_table();

    // Now set up the second parser's custom lexer: this bugger should munch the token stream. Fast!
    parser.__lexer__ = {
      // internals:
      __input__: null,                                      // input array of (tokens + values), set up by `setInput()` API
      __input_length__: 0,                                  // cached length of input, set up by `setInput()` API
      __cursor_pos__: 0,                                    // index position of next token to deliver

      // ## API
      yytext: null,

      setInput: function setInput2(input, yy) {
        console.log('set input to from token list: ', input);
        this.__input__ = input;
        this.__input_length__ = input.length;
        // reset cursor position:
        this.__cursor_pos__ = 0;
      },

      lex: function lex2() {
        console.log('LEX: input token list: ', this.__input__.slice(this.__cursor_pos__), '@cursor:', this.__cursor_pos__);
        if (this.__input_length__ - this.__cursor_pos__ > 0) {
          var l = this.__input__;
          var c = this.__cursor_pos__;
          var t = l[c];
          c++;

          console.log('shift TOKEN from token list: ', t, parser.describeSymbol(Math.abs(t)));

          // marked token ID indicates that a VALUE is following on its heels...
          var n = param_count_per_opcode[t];
          if (n) {
            // also pop value:
            var v = l[c];
            c++;

            // and set it up for lex() to feed it to the parser engine properly:
            this.yytext = v;

            console.log('shift VALUE from token list: ', v);
          }
          this.__cursor_pos__ = c;
          return t;
        }
        // end of stream: keep spitting out EOF tokens until Kingdom Come:
        return parser.EOF;
      }
    };

    // Execute the second parser: takes a formula/expression token stream as input and
    // spits out the calculated value per line:
    var calc_output = parser.parse(toklst);
    console.log('calculated result from interpreter: ', calc_output);


    console.warn("\n\n\n@@@ 3 : COMPILER BACK-END PARSE PHASE @@@\n\n\n");
    

    // Now set up the third parser's custom lexer: this bugger should munch the token stream. Fast!
    compiled_calc_codegen.__lexer__ = parser.__lexer__;

    // Execute the third parser: : takes a formula/expression token stream as input and
    // spits out native JavaScript code ready to calculate the formula per line:
    var sourcecode = compiled_calc_codegen.parse(toklst);
    console.log('generated source code: ', sourcecode);


    console.warn("\n\n\n@@@ 4 : PRETTY-PRINTING BACK-END PARSE PHASE @@@\n\n\n");
    

    // Now set up the fourth parser's custom lexer: this bugger should munch the token stream. Fast!
    compiled_calc_print.__lexer__ = parser.__lexer__;
    compiled_calc_print.options.debug = true;

    // Execute the fourth parser: : takes a formula/expression token stream as input and
    // spits out the human-readable formatted formula per line:
    var human_output = compiled_calc_print.parse(toklst);
    console.log('generated human-readable pretty-print output: ', human_output);

    return 2;
};

