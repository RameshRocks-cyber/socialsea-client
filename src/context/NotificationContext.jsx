import { createContext, useState } from "react";

export const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);

  return (
    <NotificationContext.Provider value={{ count, setCount, items, setItems }}>
      {children}
    </NotificationContext.Provider>
  );
};