//Librerias
var fs = require('fs');
const util = require('util');
const access = util.promisify(fs.access);
const readdir = util.promisify(fs.readdir);
const mkdirSync = util.promisify(fs.mkdirSync);
const copyFile = util.promisify(fs.copyFile);
const path = require('path');
let Client = require('ssh2-sftp-client');

//Elementos html
let startButton = document.getElementById("startButton");
let heroSection = document.getElementById('heroSection');
let processingSection = document.getElementById('processingSection');
let resultSection = document.getElementById('resultSection');
let currentAction = document.getElementById('currentAction');
let logList = document.getElementById('logList');
let successCountBadge = document.getElementById('successCount');
let connectionDot = document.getElementById('connectionDot');
let connectionText = document.getElementById('connectionText');
let iconSuccess = document.getElementById('iconSuccess');
let iconError = document.getElementById('iconError');
let errorTitle = document.getElementById('errorTitle');
let errorSubtitle = document.getElementById('errorSubtitle');

let haveError = false;
let filesUploaded = 0;

//Variables
const mainRoute = 'G:/PDFWIN2/ADIGITAL/GESTION/2026';
const mainfolders = [
    { name: '470-3296', nameInitials: 'AER' },
    { name: '510-3296', nameInitials: 'LZO' },
    { name: '850-3296', nameInitials: 'AFA' }
];

//Datos de servidor FTP
let ftpProduction = {
    user: 'CargoDec',
    password: 'C@!Dg38u47#',
    host: 'amz.sice.com.mx',
    route: '/CargoDec',
    port: 22
};

let ftpOracleBridge = {
    user: 'opc',
    privateKeyPath: 'C:/Users/Administrator/Desktop/Llave/id_ed25519',
    host: '159.54.128.77',
    route: '/home/opc/amazon_sync',
    port: 22
};

// ACTIVAMOS EL PUENTE ORACLE
let ftpData = ftpOracleBridge;

function addLog(message, type = 'info') {
    const li = document.createElement('li');
    li.textContent = message;
    if(type) li.className = type;
    logList.appendChild(li);
    logList.scrollTop = logList.scrollHeight;
}

//Conexion con ftp de AMAZON
let sftp;
const initConnection = async () => {
    connectionDot.className = 'dot yellow';
    connectionText.textContent = 'Conectando...';
    try{
        sftp = new Client();
        let connectOptions = {
            host: ftpData.host,
            port: ftpData.port,
            username: ftpData.user,
        };
        if (ftpData.privateKeyPath) {
            connectOptions.privateKey = fs.readFileSync(ftpData.privateKeyPath);
        } else {
            connectOptions.password = ftpData.password;
        }
        await sftp.connect(connectOptions);
        connectionDot.className = 'dot green';
        connectionText.textContent = 'Conectado a SFTP (Buzón Oracle)';
    }catch(err){
        console.log('Ocurrio un error', err);
        connectionDot.className = 'dot red';
        connectionText.textContent = 'Error de conexión';
        haveError = true;
    };
};
initConnection();

//Funcion
startButton.addEventListener('click', async () => {
    if(haveError) {
        showError("Sin Conexión", "No se pudo conectar al servidor SFTP. Revisa tu red y reinicia la app.");
        return;
    }
    heroSection.classList.add('hidden');
    processingSection.classList.remove('hidden');
    addLog('Iniciando proceso general...', 'info');

    for(let i=0; i<mainfolders.length; i++){
        let folder = mainfolders[i];
        addLog(`Analizando ruta: ${folder.name}`, 'info');
        await initProcess(folder);
    };

    if(!haveError){
        processingSection.classList.add('hidden');
        resultSection.classList.remove('hidden');
        iconSuccess.classList.remove('hidden');
    };
});

function showError(title, subtitle) {
    heroSection.classList.add('hidden');
    processingSection.classList.add('hidden');
    resultSection.classList.remove('hidden');
    iconError.classList.remove('hidden');
    errorTitle.textContent = title;
    errorSubtitle.textContent = subtitle;
}

const safeReaddir = async (route) => {
    try {
        return await readdir(route);
    } catch(e) {
        return [];
    }
}

const initProcess = async (folder) => {
    let url = `${mainRoute}/${folder.name}/ACA140623TXA`;
    let folders = await safeReaddir(url);
    let currentDate = new Date();
    currentDate = (currentDate.getFullYear())+'';
    let digits = `${currentDate.substr(3,1)}0`;
    
    try {
        if(folders && folders.length > 0){
            for(let i=0; i<folders.length; i++){
                let currentFolder = folders[i];

                if((/(^|\/)\.[^\/\.]/g).test(currentFolder)) continue;
                
                currentAction.textContent = `Buscando en: ${currentFolder}`;
                
                let splitFolder = currentFolder.split('-');
                if(splitFolder.length < 2) continue;
                
                let yearPart = splitFolder[0].split(folder.nameInitials);
                if(yearPart.length < 2) continue;
                
                let year = yearPart[1];
                let folderNumber = splitFolder[1];

                let currentRoute = `${mainRoute}/${folder.name}/ACA140623TXA/${currentFolder}`;
                let subFoders = await safeReaddir(currentRoute);
                subFoders = subFoders.filter(e => (/(^|\/)\.[^\/\.]/g).test(e) == false);
                
                if(subFoders && subFoders.length){
                    let existAmazon = subFoders.find(e => e.toLowerCase() == 'amazon');

                    if(!existAmazon){
                        let existHojascalculo = await searchFile(subFoders, currentRoute, `${folder.nameInitials}${year}_${folderNumber}_Hojascalculo.pdf`);
                        if(existHojascalculo){
                            addLog(`Encontrado: ${currentFolder}`, 'info');
                            currentAction.textContent = `Procesando: ${currentFolder}`;
                            
                            //Crear carpeta AMAZON
                            try { fs.mkdirSync(`${currentRoute}/AMAZON`); } catch(e) {}
                            
                            //Helper para copiar y subir
                            const processFile = async (orig, targetName) => {
                                if(!orig) return;
                                let dest = `${currentRoute}/AMAZON/${targetName}`;
                                await copyFile(orig, dest);
                                await sftp.put(dest, `${ftpData.route}/${targetName}`);
                                filesUploaded++;
                                successCountBadge.textContent = `${filesUploaded} Subidos`;
                            }

                            //Buscar archivos
                            let existPT = await searchFile(subFoders, currentRoute, `${folder.nameInitials}${year}-${folderNumber}.pdf`);
                            await processFile(existPT, `${folder.name}-${digits}${folderNumber}-PT.pdf`);
                            
                            await processFile(existHojascalculo, `${folder.name}-${digits}${folderNumber}-HC.pdf`);
                            
                            let existMV = await searchFile(subFoders, currentRoute, `${folder.nameInitials}${year}_${folderNumber}_Manifestacion.pdf`);
                            await processFile(existMV, `${folder.name}-${digits}${folderNumber}-MV.pdf`);
                            
                            let existPS = await searchFile(subFoders, currentRoute, `${folder.nameInitials}${year}-${folderNumber}_SIMP.pdf`);
                            await processFile(existPS, `${folder.name}-${digits}${folderNumber}-PS.pdf`);
                            
                            let arrayCOVE = await searchMultiple(subFoders, currentRoute, `${folder.nameInitials}${year}-${folderNumber}_COVE`);
                            if(arrayCOVE.length > 0){
                                if(arrayCOVE.length > 1){
                                    for(let i=0; i<arrayCOVE.length; i++){
                                        await processFile(arrayCOVE[i], `${folder.name}-${digits}${folderNumber}-COVE-${i+1}.pdf`);
                                    };
                                }else{
                                    await processFile(arrayCOVE[0], `${folder.name}-${digits}${folderNumber}-COVE.pdf`);
                                }
                            };
    
                            let arrayFACTURA = await searchMultiple(subFoders, currentRoute, `${folder.nameInitials}${year}-${folderNumber}-FAC`);
                            if(arrayFACTURA.length > 0){
                                if(arrayFACTURA.length > 1){
                                    for(let i=0; i<arrayFACTURA.length; i++){
                                        await processFile(arrayFACTURA[i], `${folder.name}-${digits}${folderNumber}-FACT-${i+1}.pdf`);
                                    };
                                }else{
                                    await processFile(arrayFACTURA[0], `${folder.name}-${digits}${folderNumber}-FACT.pdf`);
                                };
                            };
    
                            let existBL = await searchPerCoincidence(subFoders, currentRoute, `${folder.nameInitials}${year}-${folderNumber}-GUIA`);
                            await processFile(existBL, `${folder.name}-${digits}${folderNumber}-BL.pdf`);
    
                            let existCP = await searchPerCoincidence(subFoders, currentRoute, `${folder.nameInitials}${year}-${folderNumber}-REGLA318-`);
                            await processFile(existCP, `${folder.name}-${digits}${folderNumber}-CP.pdf`);
    
                            let coincidenceRRNA = `${folder.nameInitials}${year}-${folderNumber}-CER_ANCE-`;
                            if(folder.name == '510-3296') coincidenceRRNA = `${folder.nameInitials}${year}-${folderNumber}-OFFICIOS-OFICIO`;
                            let existRRNA = await searchPerCoincidence(subFoders, currentRoute, coincidenceRRNA);
                            await processFile(existRRNA, `${folder.name}-${digits}${folderNumber}-RRNA.pdf`);
                            
                            let allM = await searchM(subFoders, currentRoute, `${folder.nameInitials}${year}-${folderNumber}_M32`, `-${folderNumber}_`);
                            if(allM){
                                await processFile(allM.m.origin, allM.m.newName);
                                await processFile(allM.err.origin, allM.err.newName);
                            };
                            addLog(`Archivos de ${currentFolder} subidos`, 'success');
                        };
                    };
                };
            };
        };
    } catch (err) {
      console.log(err);
      haveError = true;
      showError("Error de Subida", err.message || "Ocurrió un error inesperado al subir archivos al FTP.");
    };
};

const searchMultiple = async (folders, baseUrl, coincidence) => {
    let locations = [];
    for(let i=0; i<folders.length; i++){
        let currentFolder = folders[i];
        let files = await safeReaddir(`${baseUrl}/${currentFolder}`);
        if(files && files.length > 0){
            let regex = new RegExp("^" + coincidence.toLowerCase() + ".*$");
            let existFile = files.filter(e => (e.toLowerCase()).match(regex) && (e.toLowerCase()).includes('.pdf'));
            if(existFile.length){
                for(let j=0; j<existFile.length; j++){
                    locations.push(`${baseUrl}/${currentFolder}/${existFile[j]}`);
                };
            };
        };  
    };
    return locations;
};

const searchPerCoincidence = async (folders, baseUrl, coincidence) => {
    for(let i=0; i<folders.length; i++){
        let currentFolder = folders[i];
        let files = await safeReaddir(`${baseUrl}/${currentFolder}`);
        if(files && files.length > 0){
            let existFile = files.find(e => (e.toLowerCase()).includes(coincidence.toLowerCase()));
            if(existFile) return `${baseUrl}/${currentFolder}/${existFile}`;
        };  
    };
    return null;
};

const searchFile = async (folders, baseUrl, fileName) => {
    for(let i=0; i<folders.length; i++){
        let currentFolder = folders[i];
        let files = await safeReaddir(`${baseUrl}/${currentFolder}`);
        if(files && files.length > 0){
            let existFile = files.find(e => e.toLowerCase() == fileName.toLowerCase());
            if(existFile) return `${baseUrl}/${currentFolder}/${existFile}`;
        };  
    };
    return null;
};

const searchM = async (folders, baseUrl, fileName, stringForSplit) => {
    let location = { m: { origin: '', newName: '' }, err:{ origin: '', newName: '' } };
    for(let i=0; i<folders.length; i++){
        let currentFolder = folders[i];
        let files = await safeReaddir(`${baseUrl}/${currentFolder}`);
        files = files.filter(e => (e.toLowerCase()).includes(fileName.toLowerCase()));
        if(files && files.length > 0){
            let err = files.find(e => (e.toLowerCase()).match(/.*\.err$/));
            let copyFiles = files.slice();
            if(err){
                let newNameE = err.split(stringForSplit.toLowerCase());
                location.err.origin = `${baseUrl}/${currentFolder}/${err}`;
                location.err.newName = newNameE[1];
                copyFiles = copyFiles.filter(e => e != err);
            };

            for(let j=0; j<copyFiles.length; j++){
                let currentFile = copyFiles[j];
                let searchFile = currentFile.split('.');
                if(searchFile[1].length == 3 && parseInt(searchFile[1])){
                    let newName = currentFile.split(stringForSplit.toLowerCase());
                    location.m.origin = `${baseUrl}/${currentFolder}/${currentFile}`;
                    location.m.newName = newName[1];
                    break;
                };
            };
        }; 
        if(location.m.origin && location.err.origin) break;
    };
    return location.m.origin || location.err.origin ? location : null;
};