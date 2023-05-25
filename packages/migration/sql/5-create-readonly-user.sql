CREATE USER '${READONLY_USERNAME}'@'%' IDENTIFIED BY 'ossinsight_lite_readonly_password';

GRANT SELECT, SHOW DATABASES, SHOW VIEW ON *.* TO '${READONLY_USERNAME}'@'%';

FLUSH PRIVILEGES;
