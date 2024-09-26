# Online OH Queue Backend
A NodeJS centered backend complimented with MySQL database for the Online
OH Queue project found on the following repository:

[Online OH Queue Github](https://github.com/Nicmatt-15/Online-OH-Queue)

## Things for Future
1. Implement environment variable for better safety
2. Implement session for logged in user that can expire
3. Add API documentation

## Note
1. If node immediately terminates after being started:

    - Check if there is already other app occupying the 3000 port
        ```
        netstat -ano | findstr :3000
        ```

    - Get the app PID and terminate it if there is one
        ```
        taskkill /PID ... /F
        ```