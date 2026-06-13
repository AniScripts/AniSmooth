const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');
const jsxbin = require('jsxbin');
const zxpSignCmd = require('zxp-sign-cmd');

const SRC_DIR = path.join(__dirname, '..', 'AniSmooth');
const DIST_DIR = path.join(__dirname, '..', 'dist', 'Extension Folder', 'AniSmooth');
const EXTENSION_NAME = 'AniSmooth';
const BUNDLE_ID = 'com.anismooth.extension';
const CERT_PASSWORD = 'anismooth_extension_pass';

function copyFolderSync(from, to) {
    if (!fs.existsSync(to)) {
        fs.mkdirSync(to, { recursive: true });
    }
    fs.readdirSync(from).forEach(element => {
        const fromPath = path.join(from, element);
        const toPath = path.join(to, element);
        if (fs.lstatSync(fromPath).isDirectory()) {
            copyFolderSync(fromPath, toPath);
        } else {
            if (!element.endsWith('.jsxbin') && !element.endsWith('.rar') && !element.endsWith('.zip')) {
                fs.copyFileSync(fromPath, toPath);
            }
        }
    });
}

function getFiles(dir, extension, files_ = []) {
    const files = fs.readdirSync(dir);
    for (const i in files) {
        const name = path.join(dir, files[i]);
        if (fs.statSync(name).isDirectory()) {
            getFiles(name, extension, files_);
        } else if (name.endsWith(extension)) {
            files_.push(name);
        }
    }
    return files_;
}

async function runBuild() {
    console.log(`🚀 Starting ${EXTENSION_NAME} AE Extension Build Process...`);

    
    if (fs.existsSync(DIST_DIR)) {
        console.log('🧹 Cleaning existing dist directory...');
        fs.rmSync(DIST_DIR, { recursive: true, force: true });
    }

    
    console.log('📂 Copying files to dist...');
    copyFolderSync(SRC_DIR, DIST_DIR);

    
    console.log('🔒 Obfuscating JavaScript files...');
    const jsFiles = getFiles(DIST_DIR, '.js');

    for (const file of jsFiles) {
        const filename = path.basename(file);
        if (filename === 'CSInterface.js') {
            console.log(`   - Skipping library: ${filename}`);
            continue;
        }

        console.log(`   - Obfuscating: ${path.relative(DIST_DIR, file)}`);
        const originalCode = fs.readFileSync(file, 'utf8');

        try {
            const obfuscated = JavaScriptObfuscator.obfuscate(originalCode, {
                compact: true,
                controlFlowFlattening: true,
                controlFlowFlatteningThreshold: 0.5,
                deadCodeInjection: false,
                debugProtection: false,
                disableConsoleOutput: false,
                identifierNamesGenerator: 'hexadecimal',
                log: false,
                numbersToExpressions: true,
                renameGlobals: false,
                selfDefending: false,
                simplify: true,
                splitStrings: true,
                stringArray: true,
                stringArrayEncoding: ['base64'],
                stringArrayThreshold: 0.75,
                transformObjectKeys: true,
                unicodeEscapeSequence: false
            }).getObfuscatedCode();

            fs.writeFileSync(file, obfuscated, 'utf8');
        } catch (err) {
            console.error(`❌ Failed to obfuscate ${filename}:`, err.message);
        }
    }

    
    const jsxPath = path.join(DIST_DIR, 'jsx', 'host.jsx');
    const jsxbinPath = path.join(DIST_DIR, 'jsx', 'host.jsxbin');

    if (fs.existsSync(jsxPath)) {
        console.log('💎 Compiling host.jsx to host.jsxbin...');
        try {
            await jsxbin(jsxPath, jsxbinPath);
            console.log('   - Compilation successful!');
            fs.unlinkSync(jsxPath);
            console.log('   - Removed original host.jsx');
        } catch (err) {
            console.error('❌ ExtendScript binary compilation failed:', err.message);
        }
    } else {
        console.warn('⚠️ host.jsx not found in dist/jsx/');
    }

    
    const manifestPath = path.join(DIST_DIR, 'CSXS', 'manifest.xml');
    if (fs.existsSync(manifestPath)) {
        console.log('📝 Updating manifest.xml to load host.jsxbin...');
        let manifestContent = fs.readFileSync(manifestPath, 'utf8');
        if (manifestContent.includes('host.jsx</ScriptPath>')) {
            manifestContent = manifestContent.replace(
                /host\.jsx<\/ScriptPath>/g,
                'host.jsxbin</ScriptPath>'
            );
            fs.writeFileSync(manifestPath, manifestContent, 'utf8');
            console.log('   - manifest.xml successfully updated!');
        } else {
            console.warn('⚠️ Could not find ScriptPath reference to host.jsx in manifest.xml');
        }
    } else {
        console.error('❌ manifest.xml not found!');
    }

    console.log(`\n✨ Build process completed! Obfuscated extension files are in "dist/Extension Folder/${EXTENSION_NAME}".`);

    
    console.log('\n📦 Packaging and signing ZXP...');
    const certPath = path.join(__dirname, 'cert.p12');
    const zxpDir = path.join(__dirname, '..', 'dist', 'ZXP Install');
    const zxpOutputPath = path.join(zxpDir, `${EXTENSION_NAME}.zxp`);

    if (!fs.existsSync(zxpDir)) {
        fs.mkdirSync(zxpDir, { recursive: true });
    }

    if (!fs.existsSync(certPath)) {
        console.log('   - Certificate not found. Generating a self-signed certificate...');
        try {
            await zxpSignCmd.selfSignedCert({
                country: 'US',
                province: 'NY',
                org: 'AniSmooth',
                name: 'AniSmooth',
                password: CERT_PASSWORD,
                output: certPath
            });
            console.log('   - Certificate successfully created!');
        } catch (certErr) {
            console.error('❌ Failed to generate self-signed certificate:', certErr.message);
        }
    }

    if (fs.existsSync(certPath)) {
        try {
            console.log('   - Packaging to ZXP...');
            await zxpSignCmd.sign({
                input: DIST_DIR,
                output: zxpOutputPath,
                cert: certPath,
                password: CERT_PASSWORD
            });
            console.log(`✨ Successfully generated signed package: dist/ZXP Install/${EXTENSION_NAME}.zxp`);
        } catch (signErr) {
            console.error('❌ Failed to package and sign ZXP:', signErr.message);
        }
    }

    
    console.log('\n🛠️ Building Inno Setup EXE Installer...');
    const isccPaths = [
        'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
        'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
        'C:\\Program Files (x86)\\Inno Setup 5\\ISCC.exe'
    ];
    if (process.env.LOCALAPPDATA) {
        isccPaths.unshift(path.join(process.env.LOCALAPPDATA, 'Programs', 'Inno Setup 6', 'ISCC.exe'));
        isccPaths.unshift(path.join(process.env.LOCALAPPDATA, 'Programs', 'Inno Setup 5', 'ISCC.exe'));
    }
    let isccPath = null;
    for (const p of isccPaths) {
        if (fs.existsSync(p)) {
            isccPath = p;
            break;
        }
    }

    if (isccPath) {
        try {
            console.log('   - Compiling installer script...');
            const issPath = path.join(__dirname, 'installer.iss');
            const { execSync } = require('child_process');
            execSync(`"${isccPath}" "${issPath}"`, { stdio: 'inherit' });
            console.log('✨ Successfully compiled installer EXE!');
        } catch (execErr) {
            console.error('❌ Failed to compile installer EXE:', execErr.message);
        }
    } else {
        console.log('   - Inno Setup compiler (ISCC.exe) not found. Skipping automatic EXE generation.');
        console.log('     Please compile tools/installer.iss manually using Inno Setup on Windows to create the EXE.');
    }

    console.log(`\n✨ ${EXTENSION_NAME} build complete!`);
}

runBuild().catch(err => {
    console.error('💥 Build crashed:', err);
    process.exit(1);
});
