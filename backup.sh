#!/usr/bin/env bash

# Create a daily cron job for this script by creating a file in /etc/cron.d with contents:
# 1 1 */1 * * root /bin/bash /home/deepcompute/docker-hackmd/backup.sh >> /var/log/hackmd_backup.log

SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
source "$SCRIPT_DIR"/.env

file_name=$(date --date="" +"%Y"-"%m"-"%d").zip
/usr/bin/mysqldump -u $MYSQL_USER -p$MYSQL_PASSWORD --host 0.0.0.0 --port 3307 $MYSQL_DATABASE > $file_name

/home/deepcompute/docker-hackmd/env/bin/b2 authorize-account $B2_ACCOUNT_ID $B2_SECRET_KEY
/home/deepcompute/docker-hackmd/env/bin/b2 upload-file hackmd $file_name $file_name || echo "failed to upload $file_name"
rm $file_name
