const kDisplayName = "Minesweeper";
const kName = "minesweeper";
const kPackage = "/clav.mozdev.org/minesweeper";
const kVersion = "0.7.1";

const kJarFile = "minesweeper.jar";
const kContentFolder = "content/";
const kLocaleFolders = ["en/","es/"];
const kSkinFolder = "";


var kMsg = "Do you wish to install "+kDisplayName+" to your profile?\n\nClick OK to install to your profile.\n\nClick Cancel if you want to install globally.";

initInstall(kName, kPackage, kVersion);

var chromef = getFolder("chrome");
var pchromef = getFolder("Profile", "chrome");


var existsInApp     = File.exists(getFolder(chromef,  kJarFile));
var existsInProfile = File.exists(getFolder(pchromef, kJarFile));

var instToProfile = !existsInApp && (existsInProfile || confirm(kMsg));

var folder = instToProfile ? pchromef : chromef;
var flag = instToProfile ? PROFILE_CHROME : DELAYED_CHROME;

var err = addFile(kPackage, kVersion, 'chrome/'+kJarFile, folder, null)

if(err == SUCCESS) {
  var jar = getFolder(folder, kJarFile);

  registerChrome(CONTENT | flag, jar, kContentFolder);
  for(var i in kLocaleFolders) registerChrome(LOCALE | flag, jar, kLocaleFolders[i]);
  if(kSkinFolder) registerChrome(SKIN | flag, jar, kSkinFolder);

  err = performInstall();

  if(err!=SUCCESS && err!=999) {
    alert("Install failed. Error code:" + err);
    cancelInstall(err);
  }
} else {
  alert("Failed to create " +kJarFile +"\n"
    +"You probably don't have write access to mozilla/chrome/ directory).\n"
    +"Error code: " + err);
  cancelInstall(err);
}