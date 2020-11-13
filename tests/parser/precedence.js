const assert = require('chai').assert;
const Jison = require('../setup').Jison;
const RegExpLexer = require('../setup').RegExpLexer;


const lexData = {
    rules: [
        [ 'x', "return 'x';" ],
        [ '\\+', "return '+';" ],
        [ '$', "return 'EOF';" ]
    ]
};


describe('Precedence in the grammar', function () {
    it('test Left associative rule', function () {
        let lexData = {
            rules: [
                [ 'x', "return 'x';" ],
                [ '\\+', "return '+';" ],
                [ '$', "return 'EOF';" ]
            ]
        };
        let grammar = {
            tokens: [ 'x', '+', 'EOF' ],
            startSymbol: 'S',
            operators: [
                [ 'left', '+' ]
            ],
            bnf: {
                S :[ [ 'E EOF',   'return $1;' ] ],
                E :[ [ 'E + E',   "$$ = ['+', $1, $3];" ],
                    [ 'x',       "$$ = ['x'];" ] ]
            }
        };

        let parser = new Jison.Parser(grammar);
        parser.lexer = new RegExpLexer(lexData);

        let expectedAST = [ '+', [ '+', [ 'x' ], [ 'x' ] ], [ 'x' ] ];

        let r = parser.parse('x+x+x');
        assert.deepEqual(r, expectedAST);
    });

    it('test Right associative rule', function () {
        let lexData = {
            rules: [
                [ 'x', "return 'x';" ],
                [ '\\+', "return '+';" ],
                [ '$', "return 'EOF';" ]
            ]
        };
        let grammar = {
            tokens: [ 'x', '+', 'EOF' ],
            startSymbol: 'S',
            operators: [
                [ 'right', '+' ]
            ],
            bnf: {
                S :[ [ 'E EOF',   'return $1;'          ] ],
                E :[ [ 'E + E',   "$$ = ['+', $1, $3];" ],
                    [ 'x',       "$$ = ['x'];"         ] ]
            }
        };

        let parser = new Jison.Parser(grammar);
        parser.lexer = new RegExpLexer(lexData);

        let expectedAST = [ '+', [ 'x' ], [ '+', [ 'x' ], [ 'x' ] ] ];

        let r = parser.parse('x+x+x');
        assert.deepEqual(r, expectedAST);
    });

    it('test Multiple precedence operators', function () {
        let lexData = {
            rules: [
                [ 'x', "return 'x';" ],
                [ '\\+', "return '+';" ],
                [ '\\*', "return '*';" ],
                [ '$', "return 'EOF';" ]
            ]
        };
        let grammar = {
            tokens: [ 'x', '+', '*', 'EOF' ],
            startSymbol: 'S',
            operators: [
                [ 'left', '+' ],
                [ 'left', '*' ]
            ],
            bnf: {
                S :[ [ 'E EOF',   'return $1;'          ] ],
                E :[ [ 'E + E',   "$$ = ['+', $1, $3];" ],
                    [ 'E * E',   "$$ = ['*', $1, $3];" ],
                    [ 'x',       "$$ = ['x'];"         ] ]
            }
        };

        let parser = new Jison.Parser(grammar);
        parser.lexer = new RegExpLexer(lexData);

        let expectedAST = [ '+', [ '*', [ 'x' ], [ 'x' ] ], [ 'x' ] ];

        let r = parser.parse('x*x+x');
        assert.deepEqual(r, expectedAST);
    });

    it('test Multiple precedence operators', function () {
        let lexData = {
            rules: [
                [ 'x', "return 'x';" ],
                [ '\\+', "return '+';" ],
                [ '\\*', "return '*';" ],
                [ '$', "return 'EOF';" ]
            ]
        };
        let grammar = {
            tokens: [ 'x', '+', '*', 'EOF' ],
            startSymbol: 'S',
            operators: [
                [ 'left', '+' ],
                [ 'left', '*' ]
            ],
            bnf: {
                S :[ [ 'E EOF',   'return $1;'          ] ],
                E :[ [ 'E + E',   "$$ = [$1,'+', $3];" ],
                    [ 'E * E',   "$$ = [$1, '*', $3];" ],
                    [ 'x',       "$$ = ['x'];"         ] ]
            }
        };

        let parser = new Jison.Parser(grammar);
        parser.lexer = new RegExpLexer(lexData);

        let expectedAST = [ [ 'x' ], '+', [ [ 'x' ], '*', [ 'x' ] ] ];

        let r = parser.parse('x+x*x');
        assert.deepEqual(r, expectedAST);
    });

    it('test Non-associative operator', function () {
        let lexData = {
            rules: [
                [ 'x', "return 'x';" ],
                [ '=', "return '=';" ],
                [ '$', "return 'EOF';" ]
            ]
        };
        let grammar = {
            tokens: [ 'x', '=', 'EOF' ],
            startSymbol: 'S',
            operators: [
                [ 'nonassoc', '=' ]
            ],
            bnf: {
                S :[ 'E EOF' ],
                E :[ 'E = E',
                    'x' ]
            }
        };

        let parser = new Jison.Parser(grammar, { type: 'lalr' });
        let JisonParserError = parser.JisonParserError;
        assert(JisonParserError);

        parser.lexer = new RegExpLexer(lexData);

        assert.throws(function () {
            parser.parse('x=x=x');
        }, JisonParserError, /Parse error on line[^]*?Expecting end of input, got unexpected "="/);
        assert.ok(parser.parse('x=x'), 'normal use is okay.');
    });

    it('test Context-dependent precedence', function () {
        let lexData = {
            rules: [
                [ 'x', "return 'x';" ],
                [ '-', "return '-';" ],
                [ '\\+', "return '+';" ],
                [ '\\*', "return '*';" ],
                [ '$', "return 'EOF';" ]
            ]
        };
        let grammar = {
            tokens: [ 'x', '-', '+', '*', 'EOF' ],
            startSymbol: 'S',
            operators: [
                [ 'left', '-', '+' ],
                [ 'left', '*' ],
                [ 'left', 'UMINUS' ]
            ],
            bnf: {
                S :[ [ 'E EOF',   'return $1;'       ] ],
                E :[ [ 'E - E',   "$$ = [$1,'-', $3];" ],
                    [ 'E + E',   "$$ = [$1,'+', $3];" ],
                    [ 'E * E',   "$$ = [$1,'*', $3];" ],
                    [ '- E',     "$$ = ['#', $2];", { prec: 'UMINUS' } ],
                    [ 'x',       "$$ = ['x'];"         ] ]
            }
        };

        let parser = new Jison.Parser(grammar, { type: 'slr' });
        parser.lexer = new RegExpLexer(lexData);

        let expectedAST = [ [ [ [ '#', [ 'x' ] ], '*', [ '#', [ 'x' ] ] ], '*', [ 'x' ] ], '-', [ 'x' ] ];

        let r = parser.parse('-x*-x*x-x');
        assert.deepEqual(r, expectedAST);
    });

    it('test multi-operator rules', function () {
        let lexData = {
            rules: [
                [ 'x', "return 'ID';" ],
                [ '\\.', "return 'DOT';" ],
                [ '=', "return 'ASSIGN';" ],
                [ '\\(', "return 'LPAREN';" ],
                [ '\\)', "return 'RPAREN';" ],
                [ '$', "return 'EOF';" ]
            ]
        };
        let grammar = {
            tokens: 'ID DOT ASSIGN LPAREN RPAREN EOF',
            startSymbol: 'S',
            operators: [
                [ 'right', 'ASSIGN' ],
                [ 'left', 'DOT' ]
            ],
            bnf: {
                S :[ [ 'e EOF',   'return $1;'       ] ],
                id:[ [ 'ID', "$$ = ['ID'];" ] ],
                e :[ [ 'e DOT id',   "$$ = [$1,'-', $3];" ],
                    [ 'e DOT id ASSIGN e',   "$$ = [$1,'=', $3];" ],
                    [ 'e DOT id LPAREN e RPAREN',   "$$ = [$1,'+', $3];" ],
                    [ 'id ASSIGN e',   "$$ = [$1,'+', $3];" ],
                    [ 'id LPAREN e RPAREN',   "$$ = [$1,'+', $3];" ],
                    [ 'id',       '$$ = $1;'         ] ]
            }
        };

        let gen = new Jison.Generator(grammar, { type: 'slr' });

        assert.equal(gen.conflicts, 0);
    });
});

