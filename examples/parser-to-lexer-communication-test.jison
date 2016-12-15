
/* 
 * description: Test parser action code to lexer action code communication hack behaviour:
 * check how many look-ahead tokens are consumed by the lexer before it realizes the parser
 * has triggered a mode change, for example.
 *
 * Another test executed in this sample grammar is the check when epsilon rule action
 * code blocks are actually executed: are they executed *immediately* or is there some
 * delay there too?
 */

//%debug                                           // cost ~ 2-4% having it in there when not used. Much higher cost when actually used.
//%options output-debug-tables
%options no-default-action                         // cost is within noise band. Seems ~0.5-1%
%options no-try-catch                              // cost is within noise band. Seems ~1-2%


%lex

%options ranges

%x alt

%%

'('                 return '(';
')'                 return ')';
.                   return 'A';

<alt>'('            return 'BEGIN';
<alt>')'            return 'END';
<alt>.              return 'B';

/lex


%token BEGIN     "begin=("
%token END       "end=)"
%token A         "A=."
%token B         "B=."

%%



S
    : init x x e                -> parser.trace('S:complete = ', $e);
    ;

init
    : %epsilon                  -> parser.trace('init:epsilon');
    ;

x
    : %epsilon                  -> parser.trace('X:epsilon');                    $$ = '<X-epsilon>';
    ;

e
    : cmd e                     -> parser.trace('e:cmd=', $cmd);                 $$ = $cmd + ' | ' + $e;
    | %epsilon                  -> parser.trace('e:epsilon');                    $$ = '<E-epsilon>';
    ;

cmd
    : a                         -> parser.trace('cmd:a');                        $$ = $a;
    | f_a                       -> parser.trace('cmd:function a()');             $$ = $f_a;
    | b                         -> parser.trace('cmd:b');                        $$ = $b;
    | f_b                       -> parser.trace('cmd:function b()');             $$ = $f_b;
    | error                     -> parser.trace('cmd:error', get_reduced_error_info_obj($error) || $error);            yyerrok; yyclearin; $$ = 'ERROR';
    ;

a
    : A                         -> parser.trace('a:A');                          $$ = 'A[' + $A + ']';
    ;

f_a
    : A lb e rb                 -> parser.trace('function a:', $e);              $$ = 'A' + $lb + $e + $rb;
    ;

b
    : B                         -> parser.trace('b:B');                          $$ = 'B[' + $B + ']';
    ;

f_b
    : B lb e rb                 -> parser.trace('function b:', $e);              $$ = 'B' + $lb + $e + $rb;
    ;

lb
    : '('                       -> parser.trace('lb+PUSH:[(] '); yy.lexer.pushState('alt'); $$ = '(';
    | BEGIN                     -> parser.trace('lb:[alt-(] '); $$ = '{';
    ;

rb
    : ')'                       -> parser.trace('lb:[)] ');                      $$ = ')';
    | END                       -> parser.trace('lb+POP:[alt-)] '); yy.lexer.popState(); $$ = '}';
    ;

%%


%include 'benchmark.js'


// rephrase for display: error info objects which have been pushed onto the vstack:
function get_filtered_value_stack(vstack) {
    var rv = [];
    for (var i = 0, len = vstack.length; i < len; i++) {
        var o = vstack[i];
        if (o && o.errStr) {
            o = '#ERRORINFO#: ' + o.errStr;
        }
        rv.push(o);
    }
    return rv;
}

function get_reduced_error_info_obj(hash) {
    if (!hash || !hash.errStr) {
        return null;
    }
    return {
        text: hash.text,
        token: hash.token,
        token_id: hash.token_id,
        expected: hash.expected,
        matched: (hash.lexer && hash.lexer.matched) || '(-nada-)',
        lexerConditionStack: (hash.lexer && hash.lexer.conditionStack) || '(???)',
        remaining_input: (hash.lexer && hash.lexer._input) || '(-nada-)',
        recoverable: hash.recoverable,
        state_stack: hash.state_stack,
        value_stack: get_filtered_value_stack(hash.value_stack)
    };    
}

parser.main = function compiledRunner(args) {
    var inp = 'xxx(x(x)x)xxx';
    console.log('input = ', inp);


    // set up a custom parseError handler.
    //
    // Note that this one has an extra feature: it tweaks the `yytext` value to propagate 
    // the error info into the parser error rules as `$error`: 
    parser.parseError = function altParseError(msg, hash) {
        if (hash && hash.exception) {
            msg = hash.exception.message;
            //console.log('ex:', hash.exception, hash.exception.stack);
        }
        console.log("### ERROR: " + msg, get_reduced_error_info_obj(hash));
        if (hash && hash.lexer) {
            hash.lexer.yytext = hash;
        };
    };

    parser.lexer.options.post_lex = function (tok) {
        parser.trace('lexer produces one token: ', tok, parser.describeSymbol(tok));
    };

    parser.options.debug = false;     

    function execute() {
        parser.parse(inp);
    }

    if (0) {
        execute();
    } else {
        // nuke the console output via trace() and output minimal progress while we run the benchmark:
        parser.trace = function nada_trace() {};
        // make sure to disable debug output at all, so we only get the conditional check as cost when `%debug` is enabled for this grammar
        parser.options.debug = false;     

        // track number of calls for minimal/FAST status update while benchmarking... 
        var logcount = 0;
        parser.post_parse = function (tok) {
            logcount++;
            if (logcount % 65000 === 0) {
                console.log('run #', logcount);
            }
        };

        bench(execute, 0, 10e3, null, function () {
            console.log('run #', logcount);
        });
    }

    return 0;
};

