const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { readFileSync } = require('fs');
const { doc, getDoc, setDoc } = require('firebase/firestore');

(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-financio',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });

  const unauthDb = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(unauthDb, 'users/user1')));

  const user1Db = env.authenticatedContext('user1', { role: 'user' }).firestore();
  await assertSucceeds(setDoc(doc(user1Db, 'users/user1'), { name: 'Alice' }));

  const user2Db = env.authenticatedContext('user2', { role: 'user' }).firestore();
  await assertSucceeds(setDoc(doc(user2Db, 'users/user2'), { name: 'Bob' }));
  await assertFails(getDoc(doc(user1Db, 'users/user2')));

  const projectRef = doc(user1Db, 'projects/project1');
  await assertSucceeds(setDoc(projectRef, { ownerId: 'user1' }));
  await assertFails(getDoc(doc(user2Db, 'projects/project1')));

  const adminDb = env.authenticatedContext('admin', { role: 'admin' }).firestore();
  await assertSucceeds(setDoc(doc(adminDb, 'admin/config'), { enabled: true }));
  await assertFails(setDoc(doc(user1Db, 'admin/config'), { enabled: true }));

  console.log('Firestore security rules tests completed');
  await env.cleanup();
})();
