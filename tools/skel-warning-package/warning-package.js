process.stderr.write(
  "The package " + ~package~ + " at " + ~version~ + " is incompatible with Meteor 0.9.0 or later. \n");
process.stderr.write(
  "If a new, compatible version of this package exists, "+
  "running 'meteor update' should cause you to update. \n");
