(function (root, factory) {
  const api = factory(root.TraversalLab || {});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TraversalLab = Object.assign(root.TraversalLab || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : self, function (core) {
  const NAMES = ['values','numbers','data','total','count','minimum','maximum','left','right','index','current','previous','answer','frequency','seen','pending','text','character'];
  function identifiers(source) { return new Set(source.match(/\b[A-Za-z_$][\w$]*\b/g) || []); }
  function namesFor(source) { const used = identifiers(source); const take = preferred => { let name = preferred; let n = 2; while (used.has(name)) name = `${preferred}${n++}`; used.add(name); return name; }; return { take }; }
  function generateSnippet(language, source, variant = 0) {
    const n = namesFor(source), values = n.take(variant % 2 ? 'data' : 'values'), total = n.take('total'), count = n.take('count'), value = n.take('value'), answer = n.take('answer'), index = n.take('index'), left = n.take('left'), right = n.take('right'), minimum = n.take('minimum'), maximum = n.take('maximum');
    const family = Math.abs(Number(variant) || 0) % 12;
    if (family === 1) {
      if (language === 'python') return `${values} = [8, 3, 6, 2, 7]\n${minimum} = ${values}[0]\n${maximum} = ${values}[0]\nfor ${value} in ${values}[1:]:\n    if ${value} < ${minimum}:\n        ${minimum} = ${value}\n    if ${value} > ${maximum}:\n        ${maximum} = ${value}\n${answer} = ${maximum} - ${minimum}`;
      if (language === 'java') return `{\n    int[] ${values} = {8, 3, 6, 2, 7};\n    int ${minimum} = ${values}[0];\n    int ${maximum} = ${values}[0];\n    for (int ${value} : ${values}) {\n        if (${value} < ${minimum}) ${minimum} = ${value};\n        if (${value} > ${maximum}) ${maximum} = ${value};\n    }\n    int ${answer} = ${maximum} - ${minimum};\n    if (${answer} < 0) ${answer} = 0;\n}`;
      if (language === 'cpp') return `{\n    int ${values}[] = {8, 3, 6, 2, 7};\n    int ${minimum} = ${values}[0];\n    int ${maximum} = ${values}[0];\n    for (int ${value} : ${values}) {\n        if (${value} < ${minimum}) ${minimum} = ${value};\n        if (${value} > ${maximum}) ${maximum} = ${value};\n    }\n    int ${answer} = ${maximum} - ${minimum};\n    (void)${answer};\n}`;
      const typed = language === 'typescript' ? ': number[]' : '';
      return `{\n    const ${values}${typed} = [8, 3, 6, 2, 7];\n    let ${minimum} = ${values}[0];\n    let ${maximum} = ${values}[0];\n    for (const ${value} of ${values}) {\n        if (${value} < ${minimum}) ${minimum} = ${value};\n        if (${value} > ${maximum}) ${maximum} = ${value};\n    }\n    const ${answer} = ${maximum} - ${minimum};\n    void ${answer};\n}`;
    }
    if (family === 2) {
      if (language === 'python') return `${values} = [2, 4, 1, 3]\n${total} = 0\n${answer} = []\nfor ${value} in ${values}:\n    ${total} += ${value}\n    ${answer}.append(${total})\nif ${answer}:\n    ${total} = ${answer}[-1]`;
      if (language === 'java') return `{\n    int[] ${values} = {2, 4, 1, 3};\n    int[] ${answer} = new int[${values}.length];\n    int ${total} = 0;\n    for (int ${index} = 0; ${index} < ${values}.length; ${index}++) {\n        ${total} += ${values}[${index}];\n        ${answer}[${index}] = ${total};\n    }\n    if (${answer}.length > 0) ${total} = ${answer}[${answer}.length - 1];\n}`;
      if (language === 'cpp') return `{\n    int ${values}[] = {2, 4, 1, 3};\n    int ${answer}[4] = {};\n    int ${total} = 0;\n    for (int ${index} = 0; ${index} < 4; ++${index}) {\n        ${total} += ${values}[${index}];\n        ${answer}[${index}] = ${total};\n    }\n    if (${answer}[3] < 0) ${total} = 0;\n}`;
      const typed = language === 'typescript' ? ': number[]' : '';
      return `{\n    const ${values}${typed} = [2, 4, 1, 3];\n    const ${answer}${typed} = [];\n    let ${total} = 0;\n    for (const ${value} of ${values}) {\n        ${total} += ${value};\n        ${answer}.push(${total});\n    }\n    if (${answer}.length > 0) ${total} = ${answer}[${answer}.length - 1];\n}`;
    }
    if (family === 3) {
      if (language === 'python') return `${values} = [1, 2, 3, 4, 5, 6]\n${left} = 0\n${right} = len(${values}) - 1\n${total} = 0\nwhile ${left} <= ${right}:\n    ${total} += ${values}[${left}]\n    if ${left} != ${right}:\n        ${total} += ${values}[${right}]\n    ${left} += 1\n    ${right} -= 1\n${answer} = ${total}`;
      const declaration = language === 'java' ? 'int[]' : language === 'cpp' ? 'int' : language === 'typescript' ? 'const' : 'const';
      if (language === 'java') return `{\n    int[] ${values} = {1, 2, 3, 4, 5, 6};\n    int ${left} = 0, ${right} = ${values}.length - 1, ${total} = 0;\n    while (${left} <= ${right}) {\n        ${total} += ${values}[${left}];\n        if (${left} != ${right}) ${total} += ${values}[${right}];\n        ${left}++; ${right}--;\n    }\n    int ${answer} = ${total};\n}`;
      if (language === 'cpp') return `{\n    int ${values}[] = {1, 2, 3, 4, 5, 6};\n    int ${left} = 0, ${right} = 5, ${total} = 0;\n    while (${left} <= ${right}) {\n        ${total} += ${values}[${left}];\n        if (${left} != ${right}) ${total} += ${values}[${right}];\n        ++${left}; --${right};\n    }\n    int ${answer} = ${total};\n    (void)${answer};\n}`;
      const typed = language === 'typescript' ? ': number[]' : '';
      return `{\n    const ${values}${typed} = [1, 2, 3, 4, 5, 6];\n    let ${left} = 0, ${right} = ${values}.length - 1, ${total} = 0;\n    while (${left} <= ${right}) {\n        ${total} += ${values}[${left}];\n        if (${left} !== ${right}) ${total} += ${values}[${right}];\n        ${left} += 1; ${right} -= 1;\n    }\n    const ${answer} = ${total};\n    void ${answer};\n}`;
    }
    if (family === 4) {
      const text = n.take('text'), character = n.take('character'), frequency = n.take('frequency');
      if (language === 'python') return `${text} = "traversal"\n${frequency} = {}\nfor ${character} in ${text}:\n    ${frequency}[${character}] = ${frequency}.get(${character}, 0) + 1\n${maximum} = 0\nfor ${value} in ${frequency}.values():\n    if ${value} > ${maximum}:\n        ${maximum} = ${value}\n${answer} = ${maximum}`;
      if (language === 'java') return `{\n    String ${text} = "traversal";\n    int[] ${frequency} = new int[26];\n    for (int ${index} = 0; ${index} < ${text}.length(); ${index}++) {\n        char ${character} = ${text}.charAt(${index});\n        if (${character} >= 'a' && ${character} <= 'z') ${frequency}[${character} - 'a']++;\n    }\n    int ${maximum} = 0;\n    for (int ${value} : ${frequency}) if (${value} > ${maximum}) ${maximum} = ${value};\n}`;
      if (language === 'cpp') return `{\n    const char ${text}[] = "traversal";\n    int ${frequency}[26] = {};\n    for (char ${character} : ${text}) if (${character} >= 'a' && ${character} <= 'z') ++${frequency}[${character} - 'a'];\n    int ${maximum} = 0;\n    for (int ${value} : ${frequency}) if (${value} > ${maximum}) ${maximum} = ${value};\n}`;
      const mapType = language === 'typescript' ? `const ${frequency}: Record<string, number>` : `const ${frequency}`;
      return `{\n    const ${text} = "traversal";\n    ${mapType} = {};\n    for (const ${character} of ${text}) ${frequency}[${character}] = (${frequency}[${character}] || 0) + 1;\n    let ${maximum} = 0;\n    for (const ${value} of Object.values(${frequency})) if (${value} > ${maximum}) ${maximum} = ${value};\n}`;
    }
    if (family === 5) {
      if (language === 'python') return `${values} = [1, 3, 5, 7, 9]\n${left} = 0\n${right} = len(${values})\n${value} = 6\nwhile ${left} < ${right}:\n    ${index} = (${left} + ${right}) // 2\n    if ${values}[${index}] < ${value}:\n        ${left} = ${index} + 1\n    else:\n        ${right} = ${index}\n${answer} = ${left}`;
      if (language === 'java') return `{\n    int[] ${values} = {1, 3, 5, 7, 9};\n    int ${left} = 0, ${right} = ${values}.length, ${value} = 6;\n    while (${left} < ${right}) {\n        int ${index} = ${left} + (${right} - ${left}) / 2;\n        if (${values}[${index}] < ${value}) ${left} = ${index} + 1; else ${right} = ${index};\n    }\n    int ${answer} = ${left};\n}`;
      if (language === 'cpp') return `{\n    int ${values}[] = {1, 3, 5, 7, 9};\n    int ${left} = 0, ${right} = 5, ${value} = 6;\n    while (${left} < ${right}) {\n        int ${index} = ${left} + (${right} - ${left}) / 2;\n        if (${values}[${index}] < ${value}) ${left} = ${index} + 1; else ${right} = ${index};\n    }\n    int ${answer} = ${left};\n    (void)${answer};\n}`;
      const typed = language === 'typescript' ? ': number[]' : '';
      return `{\n    const ${values}${typed} = [1, 3, 5, 7, 9];\n    let ${left} = 0, ${right} = ${values}.length;\n    const ${value} = 6;\n    while (${left} < ${right}) {\n        const ${index} = ${left} + Math.floor((${right} - ${left}) / 2);\n        if (${values}[${index}] < ${value}) ${left} = ${index} + 1; else ${right} = ${index};\n    }\n    const ${answer} = ${left};\n    void ${answer};\n}`;
    }
    if (family === 6) {
      const start = n.take('start');
      if (language === 'python') return `${values} = [2, 1, 5, 1, 3, 2]\n${total} = 0\n${maximum} = 0\n${start} = 0\nfor ${index}, ${value} in enumerate(${values}):\n    ${total} += ${value}\n    if ${index} - ${start} + 1 > 3:\n        ${total} -= ${values}[${start}]\n        ${start} += 1\n    if ${index} - ${start} + 1 == 3 and ${total} > ${maximum}:\n        ${maximum} = ${total}\n${answer} = ${maximum}`;
      if (language === 'java') return `{\n    int[] ${values} = {2, 1, 5, 1, 3, 2};\n    int ${total} = 0, ${maximum} = 0, ${start} = 0;\n    for (int ${index} = 0; ${index} < ${values}.length; ${index}++) {\n        ${total} += ${values}[${index}];\n        if (${index} - ${start} + 1 > 3) ${total} -= ${values}[${start}++];\n        if (${index} - ${start} + 1 == 3 && ${total} > ${maximum}) ${maximum} = ${total};\n    }\n    int ${answer} = ${maximum};\n}`;
      if (language === 'cpp') return `{\n    int ${values}[] = {2, 1, 5, 1, 3, 2};\n    int ${total} = 0, ${maximum} = 0, ${start} = 0;\n    for (int ${index} = 0; ${index} < 6; ++${index}) {\n        ${total} += ${values}[${index}];\n        if (${index} - ${start} + 1 > 3) ${total} -= ${values}[${start}++];\n        if (${index} - ${start} + 1 == 3 && ${total} > ${maximum}) ${maximum} = ${total};\n    }\n    int ${answer} = ${maximum};\n    (void)${answer};\n}`;
      const typed = language === 'typescript' ? ': number[]' : '';
      return `{\n    const ${values}${typed} = [2, 1, 5, 1, 3, 2];\n    let ${total} = 0, ${maximum} = 0, ${start} = 0;\n    for (let ${index} = 0; ${index} < ${values}.length; ${index} += 1) {\n        ${total} += ${values}[${index}];\n        if (${index} - ${start} + 1 > 3) ${total} -= ${values}[${start}++];\n        if (${index} - ${start} + 1 === 3 && ${total} > ${maximum}) ${maximum} = ${total};\n    }\n    const ${answer} = ${maximum};\n    void ${answer};\n}`;
    }
    if (family === 7) {
      const stack = n.take('stack'), pending = n.take('pending');
      if (language === 'python') return `${values} = [4, 1, 6, 3]\n${stack} = []\nfor ${value} in ${values}:\n    if ${value} % 2 == 0:\n        ${stack}.append(${value})\n${total} = 0\nwhile ${stack}:\n    ${total} += ${stack}.pop()\n${answer} = ${total}`;
      if (language === 'java') return `{\n    int[] ${values} = {4, 1, 6, 3};\n    int[] ${stack} = new int[${values}.length];\n    int ${pending} = 0;\n    for (int ${value} : ${values}) if (${value} % 2 == 0) ${stack}[${pending}++] = ${value};\n    int ${total} = 0;\n    while (${pending} > 0) ${total} += ${stack}[--${pending}];\n    int ${answer} = ${total};\n}`;
      if (language === 'cpp') return `{\n    int ${values}[] = {4, 1, 6, 3};\n    int ${stack}[4] = {}, ${pending} = 0;\n    for (int ${value} : ${values}) if (${value} % 2 == 0) ${stack}[${pending}++] = ${value};\n    int ${total} = 0;\n    while (${pending} > 0) ${total} += ${stack}[--${pending}];\n    int ${answer} = ${total};\n    (void)${answer};\n}`;
      const typed = language === 'typescript' ? ': number[]' : '';
      return `{\n    const ${values}${typed} = [4, 1, 6, 3];\n    const ${stack}${typed} = [];\n    for (const ${value} of ${values}) if (${value} % 2 === 0) ${stack}.push(${value});\n    let ${total} = 0;\n    while (${stack}.length) ${total} += ${stack}.pop() || 0;\n    const ${answer} = ${total};\n    void ${answer};\n}`;
    }
    if (family === 8) {
      const queue = n.take('queue'), pending = n.take('pending');
      if (language === 'python') return `${queue} = [5, 2, 8, 1]\n${pending} = []\nfor ${value} in ${queue}:\n    if ${value} > 2:\n        ${pending}.append(${value})\n${total} = 0\nwhile ${pending}:\n    ${total} += ${pending}.pop(0)\n${answer} = ${total}`;
      if (language === 'java') return `{\n    int[] ${queue} = {5, 2, 8, 1};\n    int[] ${pending} = new int[${queue}.length];\n    int ${left} = 0, ${right} = 0;\n    for (int ${value} : ${queue}) if (${value} > 2) ${pending}[${right}++] = ${value};\n    int ${total} = 0;\n    while (${left} < ${right}) ${total} += ${pending}[${left}++];\n    int ${answer} = ${total};\n}`;
      if (language === 'cpp') return `{\n    int ${queue}[] = {5, 2, 8, 1};\n    int ${pending}[4] = {}, ${left} = 0, ${right} = 0;\n    for (int ${value} : ${queue}) if (${value} > 2) ${pending}[${right}++] = ${value};\n    int ${total} = 0;\n    while (${left} < ${right}) ${total} += ${pending}[${left}++];\n    int ${answer} = ${total};\n    (void)${answer};\n}`;
      const typed = language === 'typescript' ? ': number[]' : '';
      return `{\n    const ${queue}${typed} = [5, 2, 8, 1];\n    const ${pending}${typed} = [];\n    for (const ${value} of ${queue}) if (${value} > 2) ${pending}.push(${value});\n    let ${total} = 0;\n    while (${pending}.length) ${total} += ${pending}.shift() || 0;\n    const ${answer} = ${total};\n    void ${answer};\n}`;
    }
    if (family === 9) {
      const current = n.take('current');
      if (language === 'python') return `${values} = [7, 2, 5, 1]\nfor ${index} in range(1, len(${values})):\n    ${current} = ${values}[${index}]\n    ${left} = ${index} - 1\n    while ${left} >= 0 and ${values}[${left}] > ${current}:\n        ${values}[${left} + 1] = ${values}[${left}]\n        ${left} -= 1\n    ${values}[${left} + 1] = ${current}\n${answer} = ${values}[0] if ${values} else 0`;
      if (language === 'java') return `{\n    int[] ${values} = {7, 2, 5, 1};\n    for (int ${index} = 1; ${index} < ${values}.length; ${index}++) {\n        int ${current} = ${values}[${index}], ${left} = ${index} - 1;\n        while (${left} >= 0 && ${values}[${left}] > ${current}) { ${values}[${left} + 1] = ${values}[${left}]; ${left}--; }\n        ${values}[${left} + 1] = ${current};\n    }\n    int ${answer} = ${values}[0];\n}`;
      if (language === 'cpp') return `{\n    int ${values}[] = {7, 2, 5, 1};\n    for (int ${index} = 1; ${index} < 4; ++${index}) {\n        int ${current} = ${values}[${index}], ${left} = ${index} - 1;\n        while (${left} >= 0 && ${values}[${left}] > ${current}) { ${values}[${left} + 1] = ${values}[${left}]; --${left}; }\n        ${values}[${left} + 1] = ${current};\n    }\n    int ${answer} = ${values}[0];\n    (void)${answer};\n}`;
      const typed = language === 'typescript' ? ': number[]' : '';
      return `{\n    const ${values}${typed} = [7, 2, 5, 1];\n    for (let ${index} = 1; ${index} < ${values}.length; ${index} += 1) {\n        const ${current} = ${values}[${index}];\n        let ${left} = ${index} - 1;\n        while (${left} >= 0 && ${values}[${left}] > ${current}) { ${values}[${left} + 1] = ${values}[${left}]; ${left} -= 1; }\n        ${values}[${left} + 1] = ${current};\n    }\n    const ${answer} = ${values}[0];\n    void ${answer};\n}`;
    }
    if (family === 10) {
      const current = n.take('current');
      if (language === 'python') return `${values} = [1, 2, 3, 4]\n${current} = lambda ${value}: ${value} * ${value} + 1\n${total} = 0\nfor ${value} in ${values}:\n    if ${value} % 2 == 0:\n        ${total} += ${current}(${value})\n${answer} = float(${total}) / len(${values})`;
      if (language === 'java') return `{\n    int[] ${values} = {1, 2, 3, 4};\n    java.util.function.IntUnaryOperator ${current} = ${value} -> ${value} * ${value} + 1;\n    int ${total} = 0;\n    for (int ${value} : ${values}) if (${value} % 2 == 0) ${total} += ${current}.applyAsInt(${value});\n    double ${answer} = (double) ${total} / ${values}.length;\n}`;
      if (language === 'cpp') return `{\n    int ${values}[] = {1, 2, 3, 4};\n    auto ${current} = [](int ${value}) { return ${value} * ${value} + 1; };\n    int ${total} = 0;\n    for (int ${value} : ${values}) if (${value} % 2 == 0) ${total} += ${current}(${value});\n    double ${answer} = static_cast<double>(${total}) / 4.0;\n    (void)${answer};\n}`;
      const arg = n.take('current');
      const typed = language === 'typescript' ? ': number[]' : '';
      return `{\n    const ${values}${typed} = [1, 2, 3, 4];\n    const ${current} = (${arg}${language === 'typescript' ? ': number' : ''}) => ${arg} * ${arg} + 1;\n    let ${total} = 0;\n    for (const ${value} of ${values}) if (${value} % 2 === 0) ${total} += ${current}(${value});\n    const ${answer} = ${total} / ${values}.length;\n    void ${answer};\n}`;
    }
    if (family === 11) {
      const seen = n.take('seen'), data = n.take('data');
      if (language === 'python') return `${data} = [[1, 2], [2, 3], [3, 4]]\n${seen} = set()\n${total} = 0\nfor ${values} in ${data}:\n    for ${value} in ${values}:\n        if ${value} not in ${seen}:\n            ${seen}.add(${value})\n            ${total} += ${value}\n${answer} = ${total}`;
      if (language === 'java') return `{\n    int[][] ${data} = {{1, 2}, {2, 3}, {3, 4}};\n    java.util.Set<Integer> ${seen} = new java.util.HashSet<>();\n    int ${total} = 0;\n    for (int[] ${values} : ${data}) for (int ${value} : ${values}) if (${seen}.add(${value})) ${total} += ${value};\n    int ${answer} = ${total};\n}`;
      if (language === 'cpp') return `{\n    int ${data}[3][2] = {{1, 2}, {2, 3}, {3, 4}};\n    bool ${seen}[5] = {};\n    int ${total} = 0;\n    for (auto& ${values} : ${data}) for (int ${value} : ${values}) if (!${seen}[${value}]) { ${seen}[${value}] = true; ${total} += ${value}; }\n    int ${answer} = ${total};\n    (void)${answer};\n}`;
      const nestedType = language === 'typescript' ? ': number[][]' : '', setType = language === 'typescript' ? ': Set<number>' : '';
      return `{\n    const ${data}${nestedType} = [[1, 2], [2, 3], [3, 4]];\n    const ${seen}${setType} = new Set();\n    let ${total} = 0;\n    for (const ${values} of ${data}) for (const ${value} of ${values}) if (!${seen}.has(${value})) { ${seen}.add(${value}); ${total} += ${value}; }\n    const ${answer} = ${total};\n    void ${answer};\n}`;
    }
    if (language === 'python') return `${values} = [3, 1, 4, 1, 5]\n${total} = 0\n${count} = 0\nfor ${value} in ${values}:\n    if ${value} % 2 != 0:\n        ${total} += ${value}\n        ${count} += 1\n${answer} = ${total} / ${count} if ${count} else 0\nif ${answer} < 0:\n    ${answer} = 0`;
    if (language === 'java') return `{\n    int[] ${values} = {3, 1, 4, 1, 5};\n    int ${total} = 0;\n    int ${count} = 0;\n    for (int ${value} : ${values}) {\n        if (${value} % 2 != 0) {\n            ${total} += ${value};\n            ${count}++;\n        }\n    }\n    double ${answer} = ${count} == 0 ? 0.0 : (double) ${total} / ${count};\n    if (${answer} < 0) ${total} = 0;\n}`;
    if (language === 'cpp') return `{\n    int ${values}[] = {3, 1, 4, 1, 5};\n    int ${total} = 0;\n    int ${count} = 0;\n    for (int ${value} : ${values}) {\n        if (${value} % 2 != 0) {\n            ${total} += ${value};\n            ++${count};\n        }\n    }\n    double ${answer} = ${count} == 0 ? 0.0 : static_cast<double>(${total}) / ${count};\n    (void)${answer};\n}`;
    const declaration = language === 'typescript' ? `const ${values}: number[]` : `const ${values}`;
    return `{\n    ${declaration} = [3, 1, 4, 1, 5];\n    let ${total} = 0;\n    let ${count} = 0;\n    for (const ${value} of ${values}) {\n        if (${value} % 2 !== 0) {\n            ${total} += ${value};\n            ${count} += 1;\n        }\n    }\n    const ${answer} = ${count} === 0 ? 0 : ${total} / ${count};\n    void ${answer};\n}`;
  }
  function generateProgram(language, source, variant = 0) {
    const count = 2 + (Math.abs(Number(variant) || 0) % 2), parts = []; let collisionSource = source;
    for (let offset = 0; offset < count; offset++) { const part = generateSnippet(language, collisionSource, variant + offset * 5); parts.push(part); collisionSource += `\n${part}`; }
    return parts.join('\n');
  }
  return { NAMES, identifiers, namesFor, generateSnippet, generateProgram };
});
