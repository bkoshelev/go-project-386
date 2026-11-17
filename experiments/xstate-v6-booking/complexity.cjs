// Compare source-level McCabe complexity. Configuration guards and statechart
// edges are not JavaScript branches, so this does not measure the whole graph.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("../../api/node_modules/typescript");

for (const file of ["../../frontend/src/features/book-selected-slot/model.ts", "./booking.ts"]) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(path.join(__dirname, file), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const values = [];
  let guards = 0;
  function countDecisions(node) {
    if (ts.isFunctionLike(node) && node.body) return 0;
    let score = 0;
    if (
      ts.isIfStatement(node) ||
      ts.isConditionalExpression(node) ||
      ts.isCaseClause(node) ||
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isCatchClause(node)
    )
      score++;
    if (
      ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.AmpersandAmpersandToken,
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.QuestionQuestionToken,
      ].includes(node.operatorToken.kind)
    )
      score++;
    ts.forEachChild(node, (child) => {
      score += countDecisions(child);
    });
    return score;
  }
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === "guard") guards++;
    if (ts.isFunctionLike(node) && node.body) values.push(1 + countDecisions(node.body));
    ts.forEachChild(node, visit);
  }
  visit(source);
  console.log(
    JSON.stringify({
      file,
      functions: values.length,
      total: values.reduce((a, b) => a + b, 0),
      maxFunction: Math.max(...values),
      configGuards: guards,
    }),
  );
}
