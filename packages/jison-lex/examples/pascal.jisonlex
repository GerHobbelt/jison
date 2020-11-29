// title: Simple lexer example - a lexer spec without any errors
// test_input: PROGRAM BUGGABOO;
// ...
//  

// IMPORTANT NOTE:
//
// To ensure that variables declared in the action chunk here ARE visible (same scope) 
// to the user code in the tail block (after the last %%), we MUST set this code block
// up as a `%code init` block.
//
// Without the `%code init`, the block would be placed in an inner scope, where only
// the action code blocks for the lexer rules (regexes) can reach it.
//
// To see what happens, remove the '%code init' bit and recompile, then run or review
// the generated lexer JS.
//
%code init %{
/*
 * scan.l
 *
 * lex input file for pascal scanner
 *
 * extensions: to ways to spell "external" and "->" ok for "^".
 */

let line_no = 1;
// ^^^^^^^^^
// NOTE: of course, with jison-gho, one could use the `yylloc` or `yylineno` standard attributes 
//       instead of tracking the line number of the input in userland code.
//
//       Incidentally, we showcase that one in the 'unterminated comment' error-throwing
//       function at the bottom.


%}

%options flex
// ^^^^^^^^^^
// NOTE: without this, you MUST reorder the regexes below, because without this, the first match
//       for a Pascal comment '(* ... *)' would be the "("->'LPAREN' rule instead!

A [aA]
B [bB]
C [cC]
D [dD]
E [eE]
F [fF]
G [gG]
H [hH]
I [iI]
J [jJ]
K [kK]
L [lL]
M [mM]
N [nN]
O [oO]
P [pP]
Q [qQ]
R [rR]
S [sS]
T [tT]
U [uU]
V [vV]
W [wW]
X [xX]
Y [yY]
Z [zZ]
NQUOTE [^']

%%

{A}{N}{D}                                return 'AND';
{A}{R}{R}{A}{Y}                          return 'ARRAY';
{C}{A}{S}{E}                             return 'CASE';
{C}{O}{N}{S}{T}                          return 'CONST';
{D}{I}{V}                                return 'DIV';
{D}{O}                                   return 'DO';
{D}{O}{W}{N}{T}{O}                       return 'DOWNTO';
{E}{L}{S}{E}                             return 'ELSE';
{E}{N}{D}                                return 'END';
{E}{X}{T}{E}{R}{N}                       return 'EXTERNAL';
{E}{X}{T}{E}{R}{N}{A}{L}                 return 'EXTERNAL';
{F}{O}{R}                                return 'FOR';
{F}{O}{R}{W}{A}{R}{D}                    return 'FORWARD';
{F}{U}{N}{C}{T}{I}{O}{N}                 return 'FUNCTION';
{G}{O}{T}{O}                             return 'GOTO';
{I}{F}                                   return 'IF';
{I}{N}                                   return 'IN';
{L}{A}{B}{E}{L}                          return 'LABEL';
{M}{O}{D}                                return 'MOD';
{N}{I}{L}                                return 'NIL';
{N}{O}{T}                                return 'NOT';
{O}{F}                                   return 'OF';
{O}{R}                                   return 'OR';
{O}{T}{H}{E}{R}{W}{I}{S}{E}              return 'OTHERWISE';
{P}{A}{C}{K}{E}{D}                       return 'PACKED';
{B}{E}{G}{I}{N}                          return 'PBEGIN';
{F}{I}{L}{E}                             return 'PFILE';
{P}{R}{O}{C}{E}{D}{U}{R}{E}              return 'PROCEDURE';
{P}{R}{O}{G}{R}{A}{M}                    return 'PROGRAM';
{R}{E}{C}{O}{R}{D}                       return 'RECORD';
{R}{E}{P}{E}{A}{T}                       return 'REPEAT';
{S}{E}{T}                                return 'SET';
{T}{H}{E}{N}                             return 'THEN';
{T}{O}                                   return 'TO';
{T}{Y}{P}{E}                             return 'TYPE';
{U}{N}{T}{I}{L}                          return 'UNTIL';
{V}{A}{R}                                return 'VAR';
{W}{H}{I}{L}{E}                          return 'WHILE';
{W}{I}{T}{H}                             return 'WITH';
[a-zA-Z]([a-zA-Z0-9])+                   return 'IDENTIFIER';

":="                                     return 'ASSIGNMENT';
'({NQUOTE}|'')+'                         return 'CHARACTER_STRING';
":"                                      return 'COLON';
","                                      return 'COMMA';
[0-9]+                                   return 'DIGSEQ';
"."                                      return 'DOT';
".."                                     return 'DOTDOT';
"="                                      return 'EQUAL';
">="                                     return 'GE';
">"                                      return 'GT';
"["                                      return 'LBRAC';
"<="                                     return 'LE';
"("                                      return 'LPAREN';
"<"                                      return 'LT';
"-"                                      return 'MINUS';
"<>"                                     return 'NOTEQUAL';
"+"                                      return 'PLUS';
"]"                                      return 'RBRAC';
[0-9]+"."[0-9]+                          return 'REALNUMBER';
")"                                      return 'RPAREN';
";"                                      return 'SEMICOLON';
"/"                                      return 'SLASH';
"*"                                      return 'STAR';
"**"                                     return 'STARSTAR';
"->"                                     return 'UPARROW';
"^"                                      return 'UPARROW';

"(*"|"{"                              { 
     // NOTE: I did a most literal porting of the code here. Of course, there are better ways to do this in JS/jison-gho. (lexer scope for comments, String.indexOf, ...)
     let c;
     while ((c = this.input()))
     {
      // console.error('comment scanner:', { c, inp: this._input, m: this.matched })    // <-- observe some internals for debugging this.
      if (c === '}')
       break;
      else if (c === '*')
      {
       if ((c = this.input()) === ')')
        break;
       else
        this.unput(c);
      }
      else if (c === '\n')
       line_no++;
      else if (c === 0)
       commenteof();
     }
    }

[ \t\f]                                   ;

\n                                        line_no++;

.    { 
    console.error(`'${yytext[0]}' (${yytext.charCodeAt(0)}): illegal charcter at line ${line_no}. (BTW: jison-gho yylino says: ${yylineo})`);
    }

%%

function commenteof() {
 throw new Error(`unexpected EOF inside comment at line ${line_no}. (BTW: jison-gho yylino says: ${yylineo})`);
}

function yywrap() {
 return 1;
}


