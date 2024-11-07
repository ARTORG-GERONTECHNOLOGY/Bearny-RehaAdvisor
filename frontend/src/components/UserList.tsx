// src/components/UserList.js
import React, { useEffect, useState } from 'react';
import { fetchUsers } from '../api/users';

const UserList = () => {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    // Fetch the users when the component mounts
    fetchUsers()
      .then(response => {
        setUsers(response.data);
      })
      .catch(error => {
        console.error('Error fetching users:', error);
      });
  }, []);


  return (
    <ul>
      {
        users.map((user: any) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
};

export default UserList;
