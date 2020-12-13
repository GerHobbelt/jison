
import assert from 'assert';
import bnf from './parser';
import transform from './ebnf-transform';
import jisonlex from '../lex-parser';
import helpers from '../helpers-lib';
const generateSourcePrelude = helpers.generateSourcePrelude;


const version = '0.7.0-220';                              // require('./package.json').version;

function parse(grammar) {
    return bnf.parser.parse(grammar);
}

// adds a declaration to the grammar
bnf.parser.yy.addDeclaration = function bnfAddDeclaration(grammar, decl) {
    if (!decl) {
        return;
    }

    if (decl.start) {
        grammar.start = decl.start;
        delete decl.start;
    }
    if (decl.lex) {
        grammar.lex = parseLex(decl.lex.text, decl.lex.position);
        delete decl.lex;
    }
    if (decl.grammar) {
        grammar.grammar = decl.grammar;
        delete decl.grammar;
    }
    if (decl.ebnf) {
        grammar.ebnf = decl.ebnf;
        delete decl.ebnf;
    }
    if (decl.bnf) {
        grammar.bnf = decl.bnf;
        delete decl.bnf;
    }
    if (decl.operator) {
        if (!grammar.operators) grammar.operators = [];
        grammar.operators.push(decl.operator);
        delete decl.operator;
    }
    if (decl.token) {
        if (!grammar.extra_tokens) grammar.extra_tokens = [];
        grammar.extra_tokens.push(decl.token);
        delete decl.token;
    }
    if (decl.token_list) {
        if (!grammar.extra_tokens) grammar.extra_tokens = [];
        decl.token_list.forEach(function (tok) {
            grammar.extra_tokens.push(tok);
        });
        delete decl.token_list;
    }
    if (decl.parseParams) {
        if (!grammar.parseParams) grammar.parseParams = [];
        grammar.parseParams = grammar.parseParams.concat(decl.parseParams);
        delete decl.parseParams;
    }
    if (decl.parserType) {
        if (!grammar.options) grammar.options = {};
        grammar.options.type = decl.parserType;
        delete decl.parserType;
    }
    if (decl.include) {
        if (!grammar.moduleInclude) {
            grammar.moduleInclude = decl.include;
        } else {
            grammar.moduleInclude += '\n\n' + decl.include;
        }
        delete decl.include;
    }
    if (decl.actionInclude) {
        if (!grammar.actionInclude) {
            grammar.actionInclude = decl.actionInclude;
        } else {
            grammar.actionInclude += '\n\n' + decl.actionInclude;
        }
        delete decl.actionInclude;
    }
    if (decl.options) {
        if (!grammar.options) grammar.options = {};
        // last occurrence of `%options` wins:
        for (let i = 0; i < decl.options.length; i++) {
            grammar.options[decl.options[i][0]] = decl.options[i][1];
        }
        delete decl.options;
    }
    if (decl.unknownDecl) {
        if (!grammar.unknownDecls) grammar.unknownDecls = [];         // [ array of {name,value} pairs ]
        grammar.unknownDecls.push(decl.unknownDecl);
        delete decl.unknownDecl;
    }
    if (decl.imports) {
        if (!grammar.imports) grammar.imports = [];                   // [ array of {name,path} pairs ]
        grammar.imports.push(decl.imports);
        delete decl.imports;
    }
    if (decl.initCode) {
        if (!grammar.moduleInit) {
            grammar.moduleInit = [];
        }
        grammar.moduleInit.push(decl.initCode);       // {qualifier: <name>, include: <source code chunk>}
        delete decl.initCode;
    }
    if (decl.codeSection) {
        if (!grammar.moduleInit) {
            grammar.moduleInit = [];
        }
        grammar.moduleInit.push(decl.codeSection);                    // {qualifier: <name>, include: <source code chunk>}
        delete decl.codeSection;
    }
    if (decl.onErrorRecovery) {
        if (!grammar.errorRecoveryActions) {
            grammar.errorRecoveryActions = [];
        }
        grammar.errorRecoveryActions.push(decl.onErrorRecovery);      // {qualifier: <name>, include: <source code chunk>}
        delete decl.onErrorRecovery;
    }

    // debug/testing:
    let remaining_keys = Object.keys(decl);
    if (remaining_keys.length > 0) {
        console.error("Error: unsupported decl keys:", { keys, decl });
        assert(!"should never get here");
    }
};

// parse an embedded lex section
function parseLex(text, position) {
    assert(!/(?:^%lex)/.test(text.trim()));
    assert(!/(?:\/lex$)/.test(text.trim()));

    return jisonlex.parse(generateSourcePrelude(position) + text);
}

const ebnf_parser = {
    transform
};

export default {
    parse,

    transform,

    // assistant exports for debugging/testing:
    bnf_parser: bnf,
    ebnf_parser,
    bnf_lexer: jisonlex,

    version
};

