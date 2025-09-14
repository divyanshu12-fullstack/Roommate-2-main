const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

// Helper to generate a random filename
function randomFilename(ext) {
  return `code_${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`;
}

exports.executeCode = async (req, res) => {
  const { code, language } = req.body;
  if (!code || !language) {
    return res
      .status(400)
      .json({ success: false, message: "Code and language are required." });
  }

  let ext, runCmd;
  if (language === "cpp") {
    ext = "cpp";
  } else if (language === "python") {
    ext = "py";
  } else if (language === "java") {
    ext = "java";
  } else {
    return res
      .status(400)
      .json({ success: false, message: "Unsupported language." });
  }

  const filename = randomFilename(ext);
  const filepath = path.join(__dirname, "../../", filename);
  fs.writeFileSync(filepath, code);

  let execCmd;
  if (language === "cpp") {
    // Compile and run
    execCmd = `g++ ${filename} -o ${filename}.out && ./${filename}.out`;
  } else if (language === "python") {
    execCmd = `python3 ${filename}`;
  } else if (language === "java") {
    // Compile and run
    const base = filename.replace(/\.java$/, "");
    execCmd = `javac ${filename} && java ${base}`;
  }

  exec(execCmd, { cwd: path.dirname(filepath) }, (error, stdout, stderr) => {
    // Clean up temp files
    try {
      fs.unlinkSync(filepath);
      if (language === "cpp") fs.unlinkSync(filepath + ".out");
      if (language === "java") {
        const classFile = filepath.replace(/\.java$/, ".class");
        if (fs.existsSync(classFile)) fs.unlinkSync(classFile);
      }
    } catch (e) {}

    if (error) {
      return res.json({ success: false, output: stderr || error.message });
    }
    res.json({ success: true, output: stdout });
  });
};
