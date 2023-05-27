const Kuroshiro = require("kuroshiro").default;
const KuromojiAnalyzer = require("kuroshiro-analyzer-kuromoji");
const fs = require('fs');
const path = require('path');
const kuroshiro = new Kuroshiro();
const dictDir = "dicts/";
const outputDir = "output/";
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

function convert(source, target) {
    fs.readFile(source, 'utf-8', async (err, data) => {
        const objs = JSON.parse(data);
        for (let key in objs) {
            let obj = objs[key]
            obj.name = await kuroshiro.convert(obj.trans[0].split('--')[1], { mode: "normal", to: "romaji", romajiSystem: "hepburn" });
            obj.name = obj.name.replace("'","")
            obj.trans[0] = obj.trans[0].split('--')[0];
        }
        fs.writeFile(target, JSON.stringify(objs, null, 4), (err) => {
            console.log(`${target}: generated.`)
        })
    });
}

async function fallback(japanese) {
    return await kuroshiro.convert(japanese, { mode: "okurigana", to: "hiragana" })
}

async function formatOkurigana(input) {
    let leftParenthesis = input.indexOf("(")
    let rightParenthesis = input.indexOf(")")
    if (leftParenthesis === -1 || rightParenthesis === -1) {
        return input
    }
    let japanese = input.substring(0, leftParenthesis)
    let kana = input.substring(leftParenthesis + 1, rightParenthesis)
    if (kana.length === 0) {
        return japanese
    }
    if (/[a-zA-Z]/.test(kana[0])) {
        // 括号里是英文，忽略括号部分内容
        return japanese
    }
    if (!Kuroshiro.Util.isHiragana(kana[0])) {
        // console.error(`error invalid kana:${input}`)
        return fallback(japanese)
    }
    let errorCode = 0
    let errorMessage = null
    //从后向前遍历假名，把假名分配给汉字部分
    let stack = []
    let kanaEnd = kana.length - 1
    let kanjiEnd = -1
    for (let i = japanese.length - 1; i >= 0; i--) {
        if (Kuroshiro.Util.isHiragana(japanese[i])) {
            if (kanjiEnd != -1) {
                // 找到和当前相等的假名
                let kanaIndex = kanaEnd
                while (kanaIndex >= 0 && kana[kanaIndex] !== japanese[i]) {
                    kanaIndex--
                }
                stack.unshift(`(${kana.substring(kanaIndex + 1, kanaEnd + 1)})`)
                stack.unshift(`${japanese.substring(i + 1, kanjiEnd + 1)}`)
                stack.unshift(japanese[i])
                kanaEnd = kanaIndex - 1
                kanjiEnd = -1
            } else if (kana[kanaEnd] === japanese[i]) {
                stack.unshift(kana[kanaEnd])
                kanaEnd--
            } else {
                errorCode = 2
                errorMessage = input
                break
            }
        } else if (Kuroshiro.Util.isKanji(japanese[i])) {
            if (kanjiEnd === -1) {
                kanjiEnd = i
            }
        } else {
            errorCode = 1
            errorMessage = input
            break
        }
    }
    if (errorCode != 0) {
        // fallback
        console.error(`error(${errorCode}): ${errorMessage}`)
        if (japanese.includes("/")) {
            japanese = japanese.split('/')[0]
        }
        return await fallback(japanese)
    }
    if (kanaEnd >= 0 && kanjiEnd >= 0) {
        stack.unshift(`(${kana.substring(0, kanaEnd + 1)})`)
        stack.unshift(`${japanese.substring(0, kanjiEnd + 1)}`)
    }
    return stack.join("")

}

function convert2(source, target) {
    fs.readFile(source, 'utf-8', async (err, data) => {
        const objs = JSON.parse(data);
        for (let key in objs) {
            let obj = objs[key]
            let splits = obj['trans'][0].split("  ")
            let okurigana = splits[0].replace(" ", "")
            let newTrans = splits.slice(1).join("  ")
            obj['trans'][0] = newTrans
            obj['notation'] = await formatOkurigana(okurigana)
        }
        fs.writeFile(target, JSON.stringify(objs, null, 4), (err) => {
            console.log(`${target}: generated.`)
        })
    });
}

rules = {
    Japanesebasicword: convert,
    JapVocab: convert,
    Jap_: convert2,
}

fs.readdir(dictDir, async (err, files) => {
    if (err) {
        console.log(err);
        return;
    }
    await kuroshiro.init(new KuromojiAnalyzer())
    files.forEach(file => {
        const filePath = path.join(dictDir, file);
        const targetPath = path.join(outputDir, file);
        Object.keys(rules).forEach(key => {
            if (file.startsWith(key)) {
                rules[key](filePath, targetPath);
            }
        })
    })
})
