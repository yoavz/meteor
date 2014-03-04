// Given
//   packageName : name of a package
//   version : version
// gets the dependencies from the Build collection, or throws an
// error if the record does not exist.
var getDeps = function(packageName, version, architecture) {
  var version = Builds.findOne({packageName: packageName,
                                version: version,
                                $or: [{architecture: architecture},
                                     {architecture: "all"}]})
  if (!version) {
    throw new Meteor.Error(400, "Unknown dependency " + pack + " " + version);
  }
  return version.dependencies;
}


// Given an array of versions
//   (ex: [1, 2, 3])
// returns true if the versions are compatible with each other.
var areVersionsCompatible = function(vList) {
  //XXX: placeholder!
  return vList.length === 1;
}


// Dictionaries are not a real thing in Javascript, but they are helpful.
// We will define a dictionary as an object of a unique key corresponding
// to an array of values, in this case, package to versions.

// If we store our dependencies in a dictionary of packageName to possible versions,
// it is easy to see if there is a conflict.
//

// Given a package name, a version and a dictionary of package names to versions,
// inserts the version into an array corresponding to the package name. Throws an
// error if the versions in that array are not compatible.
//   dict: dictionary of package names to versions
//   packageName: name of a package
//   version: version.
var insertIntoDepDict = function(dict, version, packageName) {
 dict[packageName] = _.compact(_.union(dict[packageName], version))
 if (!areVersionsCompatible(dict[packageName])) {
   throw new Meteor.Error(400, "Incompatible Dependencies");
 }
 return dict;
}

//
// Given an array of dependency objects, returns a dependency
// dictionary of all the dependencies of each dependency (etc) or
// throws an error.
var getIterativeDeps = function(myDeps) {
  var depStack = myDeps;
  var depDict = {};
  for (var i = 0; i < depStack.length; i++) {
    var currentCheck = depStack[i];
    depDict = insertIntoDepDict(depDict,
                             currentCheck.version,
                             currentCheck.packageName);
    // XXX: At the moment deps are formatted as objects,
    // and union doesn't actually work on them correctly. Oops.
    depStack = _.union(depStack, getDeps(currentCheck.packageName,
                                         currentCheck.version));
  }
  return depDict;
}

// Takes in a set of dependency objects.
// Throws a 400 error if the set of dependency objects is not valid.
isDepSetValid = function(deps, architecture) {
  getIterativeDeps(deps, architecture);
}
