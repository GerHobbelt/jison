//
// title: test multiline action with end marker plus illegal tail 4
//
// ...
//
// test these nasty situations where we have trailing curly brace beyond the end-of-scope for the action block:
//

%%
"["[^\]]"]" %{
return true;
%}
}

